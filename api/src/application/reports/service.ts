import type { AuditChange, Report } from '../../domain/entities.js';
import { AccessDeniedError, DuplicateError, IncompatibleStateError, VersionConflictError } from '../../domain/errors.js';
import type {
  ActivityId, CorrelationId, DecimalText, EntityId, IdempotencyKey, PeriodKey,
  ReportId, RequestFingerprint, Version,
} from '../../domain/types.js';
import type { Clock } from '../ports/clock.js';
import type { AuthenticatedIdentity } from '../ports/identity.js';
import type { TransactionContext, UnitOfWork } from '../ports/unitOfWork.js';
import type { FichaAuthorizationService } from '../authorization/service.js';

/** Dependencias técnicas nuevas de aplicación; no modifican puertos ni entidades L2. */
export interface ReportTools {
  id<Kind extends 'report' | 'audit-event' | 'idempotency-record'>(kind: Kind): EntityId<Kind>;
  correlation(): CorrelationId;
  fingerprint(canonical: string): RequestFingerprint;
}
export interface CreateReportCommand {
  readonly key: IdempotencyKey;
  readonly period: PeriodKey;
  readonly quantity: DecimalText | null;
  readonly narrative: string;
}
export interface UpdateReportCommand {
  readonly key: IdempotencyKey;
  readonly expectedVersion: Version;
  readonly quantity?: DecimalText | null;
  readonly narrative?: string;
}
export type ReportReceipt = Pick<Report, 'id' | 'activityId' | 'period' | 'version'>;
export type ReportDto = Pick<Report,
  'id' | 'activityId' | 'period' | 'quantity' | 'narrative' | 'state' | 'version' | 'createdAt' | 'updatedAt'>;

function receipt(report: Report): ReportReceipt {
  return { id: report.id, activityId: report.activityId, period: report.period, version: report.version };
}

function sameSnapshot(left: Report, right: Report): boolean {
  const keys: readonly (keyof Report)[] = ['id', 'activityId', 'period', 'quantity', 'narrative', 'state',
    'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'version'];
  return keys.every(key => left[key] === right[key]);
}

export class ReportService {
  constructor(
    private readonly work: UnitOfWork,
    private readonly authorization: FichaAuthorizationService,
    private readonly clock: Clock,
    private readonly tools: ReportTools,
  ) {}

  private async activity(context: TransactionContext, id: ActivityId) {
    const activity = await context.activities.findById(id);
    if (!activity || activity.id !== id) throw new AccessDeniedError();
    return activity;
  }

  private async report(context: TransactionContext, id: ReportId) {
    const report = await context.reports.findById(id);
    if (!report || report.id !== id) throw new AccessDeniedError();
    return report;
  }

  /** Los comandos son datos ya validados por HTTP/código confiable, nunca cuerpos arbitrarios. */
  async create(identity: AuthenticatedIdentity, activityId: ActivityId, command: CreateReportCommand): Promise<ReportReceipt> {
    return this.work.runAtomic(async context => {
      const activity = await this.activity(context, activityId);
      const access = await this.authorization.requireAllowed(context, identity, activity.fichaId, 'poc:edit-report');
      const scope = { actorId: access.userId, operation: 'poc:create-report' as const, key: command.key };
      const fingerprint = this.tools.fingerprint(JSON.stringify([
        'v1', scope.operation, access.userId, identity.clientId, activity.id,
        command.period, command.quantity, command.narrative,
      ]));
      const previous = await context.idempotency.findByScope(scope);
      if (previous) {
        if (previous.requestFingerprint !== fingerprint) throw new DuplicateError();
        if (previous.state !== 'poc:completed') throw new IncompatibleStateError();
        const original = previous.outcome.report;
        if (original.activityId !== activity.id || original.period !== command.period) throw new IncompatibleStateError();
        await this.verifyOutcome(context, previous.outcome.auditEventId, original, access.userId, 'poc:report-created');
        return receipt(original);
      }
      if (await context.reports.findByActivityAndPeriod(activity.id, command.period)) throw new DuplicateError();
      const at = this.clock.now();
      const reserved = await context.idempotency.reserve({ id: this.tools.id('idempotency-record'), scope,
        requestFingerprint: fingerprint, createdAt: at });
      const report = await context.reports.create({ id: this.tools.id('report'), activityId: activity.id,
        period: command.period, quantity: command.quantity, narrative: command.narrative, state: 'poc-draft',
        createdBy: access.userId, createdAt: at, updatedBy: access.userId, updatedAt: at });
      const auditEventId = this.tools.id('audit-event');
      await context.audit.append({ id: auditEventId, actorId: access.userId, occurredAt: at,
        correlationId: this.tools.correlation(), change: { action: 'poc:report-created', before: null, after: report } });
      await context.idempotency.complete(reserved.id, reserved.version, { report, auditEventId }, at);
      return receipt(report);
    });
  }

  async update(identity: AuthenticatedIdentity, reportId: ReportId, command: UpdateReportCommand): Promise<ReportReceipt> {
    return this.work.runAtomic(async context => {
      const before = await this.report(context, reportId);
      const activity = await this.activity(context, before.activityId);
      const access = await this.authorization.requireAllowed(context, identity, activity.fichaId, 'poc:edit-report');
      const scope = { actorId: access.userId, operation: 'poc:update-report' as const, key: command.key };
      const hasQuantity = Object.hasOwn(command, 'quantity');
      const hasNarrative = Object.hasOwn(command, 'narrative');
      const fingerprint = this.tools.fingerprint(JSON.stringify([
        'v1', scope.operation, access.userId, identity.clientId, before.id, command.expectedVersion,
        hasQuantity, hasQuantity ? command.quantity : null, hasNarrative, hasNarrative ? command.narrative : null,
      ]));
      const previous = await context.idempotency.findByScope(scope);
      if (previous) {
        if (previous.requestFingerprint !== fingerprint) throw new DuplicateError();
        if (previous.state !== 'poc:completed') throw new IncompatibleStateError();
        const original = previous.outcome.report;
        if (original.id !== before.id || original.activityId !== activity.id || original.period !== before.period) throw new IncompatibleStateError();
        await this.verifyOutcome(context, previous.outcome.auditEventId, original, access.userId, 'poc:report-updated');
        return receipt(original);
      }
      if (before.state !== 'poc-draft') throw new IncompatibleStateError();
      if (context.progress && await context.progress.findSubmission(before.id)) throw new IncompatibleStateError();
      if (before.version !== command.expectedVersion) throw new VersionConflictError();
      const at = this.clock.now();
      const reserved = await context.idempotency.reserve({ id: this.tools.id('idempotency-record'), scope,
        requestFingerprint: fingerprint, createdAt: at });
      const report = await context.reports.update(before.id, command.expectedVersion, {
        quantity: hasQuantity ? command.quantity! : before.quantity,
        narrative: hasNarrative ? command.narrative! : before.narrative,
        state: before.state, updatedBy: access.userId, updatedAt: at,
      });
      const auditEventId = this.tools.id('audit-event');
      await context.audit.append({ id: auditEventId, actorId: access.userId, occurredAt: at,
        correlationId: this.tools.correlation(), change: { action: 'poc:report-updated', before, after: report } });
      await context.idempotency.complete(reserved.id, reserved.version, { report, auditEventId }, at);
      return receipt(report);
    });
  }

  async get(identity: AuthenticatedIdentity, reportId: ReportId): Promise<ReportDto> {
    return this.work.runAtomic(async context => {
      const report = await this.report(context, reportId);
      const activity = await this.activity(context, report.activityId);
      await this.authorization.requireAllowed(context, identity, activity.fichaId, 'poc:read');
      return { ...receipt(report), quantity: report.quantity, narrative: report.narrative, state: report.state,
        createdAt: report.createdAt, updatedAt: report.updatedAt };
    });
  }

  private async verifyOutcome(
    context: TransactionContext, eventId: EntityId<'audit-event'>, report: Report,
    actorId: EntityId<'user'>, action: AuditChange['action'],
  ): Promise<void> {
    const event = await context.audit.findById(eventId);
    if (!event || event.id !== eventId || event.actorId !== actorId || event.change.action !== action
        || !('activityId' in event.change.after) || !sameSnapshot(event.change.after, report)
        || report.updatedBy !== actorId) {
      throw new IncompatibleStateError();
    }
  }
}
