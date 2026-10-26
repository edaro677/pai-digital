import type { IdempotencyRepository, NewReservation } from '../../../application/ports/repositories.js';
import type { CompletedIdempotency, IdempotencyRecord, IdempotencyScope, ReportOperationOutcome, ReservedIdempotency } from '../../../domain/entities.js';
import type { IdempotencyRecordId, IdempotentOperation, UtcInstant, Version } from '../../../domain/types.js';
import { fingerprint, idempotency, idempotencyState, identifier, instant, operation, reportSnapshot, rowversion } from '../codecs.js';
import { canonical, progressSnapshot } from '../progressCodecs.js';
import { requireProgressSchema } from './progress.js';
import { SqlInfrastructureError } from '../errors.js';
import type { SqlSession } from '../session.js';
import { SqlAuditRepository } from './audit.js';
import { conflict, duplicate, expectedBytes, incompatible, mapped, notFound, queryRows, requireReference, single } from './shared.js';

const columns = 'Id, ActorId, Operation, IdempotencyKey, RequestFingerprint, CreatedAt, State, CompletedAt, OutcomeReportId, OutcomeAuditEventId, OutcomeReportJson, RV';
const select = `SELECT ${columns} FROM pai.IdempotencyRecords`;
const output = columns.split(', ').map(c => `INSERTED.${c}`).join(', ');
function supportedOperation(value: unknown, enabled: boolean): IdempotentOperation {
  if (enabled && (value === 'poc:associate-evidence' || value === 'poc:submit-report')) return value;
  return operation.decode(value);
}
function decode(row: Readonly<Record<string, unknown>>, enabled: boolean): IdempotencyRecord {
  return mapped(() => {
    const base = { id: identifier('idempotency-record').decode(row.Id), scope: {
      actorId: identifier('user').decode(row.ActorId), operation: supportedOperation(row.Operation, enabled), key: idempotency.decode(row.IdempotencyKey),
    }, requestFingerprint: fingerprint.decode(row.RequestFingerprint), createdAt: instant.decode(row.CreatedAt), version: rowversion.decode(row.RV) };
    const state = idempotencyState.decode(row.State);
    if (state === 'poc:reserved') {
      if (enabled && row.OutcomeProgressJson !== null) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      if ([row.CompletedAt, row.OutcomeReportId, row.OutcomeAuditEventId, row.OutcomeReportJson].some(v => v !== null)) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      return { ...base, state, completedAt: null, outcome: null };
    }
    const report = reportSnapshot.decode(row.OutcomeReportJson);
    if (report.id !== identifier('report').decode(row.OutcomeReportId)) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    const progress = enabled && row.OutcomeProgressJson !== null ? progressSnapshot.decode(row.OutcomeProgressJson) : undefined;
    const newOperation = base.scope.operation === 'poc:associate-evidence' || base.scope.operation === 'poc:submit-report';
    if (newOperation !== Boolean(progress) || (progress && (progress.kind === 'evidence'
      ? base.scope.operation !== 'poc:associate-evidence' || progress.evidence.reportId !== report.id || progress.evidence.version !== report.version || progress.evidence.declaredBy !== base.scope.actorId
      : base.scope.operation !== 'poc:submit-report' || progress.submission.submittedBy !== base.scope.actorId || canonical(progress.submission.report) !== canonical(report)))) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return { ...base, state, completedAt: instant.decode(row.CompletedAt), outcome: {
      report, ...(progress ? { progress } : {}), auditEventId: identifier('audit-event').decode(row.OutcomeAuditEventId),
    } };
  });
}
export class SqlIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly session: SqlSession, private readonly enableProgress = false) {}
  private get select() { return this.enableProgress ? select.replace('RV FROM', 'RV, OutcomeProgressJson FROM') : select; }
  private get output() { return this.enableProgress ? output + ', INSERTED.OutcomeProgressJson' : output; }
  private async findById(id: IdempotencyRecordId): Promise<IdempotencyRecord | null> {
    return single(await queryRows(this.session, { text: `${this.select} WHERE Id=@id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('idempotency-record').encode(id) },
    ] }), row => decode(row, this.enableProgress));
  }
  async findByScope(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    return single(await queryRows(this.session, { text: `${this.select} WHERE ActorId=@actorId AND Operation=@operation AND IdempotencyKey=@key;`, parameters: mapped(() => [
      { name: 'actorId', type: 'varchar', length: 64, value: identifier('user').encode(scope.actorId) },
      { name: 'operation', type: 'varchar', length: 40, value: supportedOperation(scope.operation, this.enableProgress) },
      { name: 'key', type: 'varchar', length: 128, value: idempotency.encode(scope.key) },
    ]) }), row => decode(row, this.enableProgress));
  }
  async reserve(request: NewReservation): Promise<ReservedIdempotency> {
    const input = mapped(() => structuredClone(request));
    const values = mapped(() => [
      { name: 'id', type: 'varchar' as const, length: 64, value: identifier('idempotency-record').encode(input.id) },
      { name: 'actorId', type: 'varchar' as const, length: 64, value: identifier('user').encode(input.scope.actorId) },
      { name: 'operation', type: 'varchar' as const, length: 40, value: supportedOperation(input.scope.operation, this.enableProgress) },
      { name: 'key', type: 'varchar' as const, length: 128, value: idempotency.encode(input.scope.key) },
      { name: 'fingerprint', type: 'varchar' as const, length: 64, value: fingerprint.encode(input.requestFingerprint) },
      { name: 'createdAt', type: 'datetime2' as const, scale: 3, value: instant.encode(input.createdAt) },
    ]);
    if (await this.findById(input.id) || await this.findByScope(input.scope)) return duplicate();
    await requireReference(this.session, 'InstitutionalUsers', input.scope.actorId);
    const result = single(await queryRows(this.session, {
      text: `INSERT INTO pai.IdempotencyRecords (Id, ActorId, Operation, IdempotencyKey, RequestFingerprint, CreatedAt, State) OUTPUT ${this.output} VALUES (@id, @actorId, @operation, @key, @fingerprint, @createdAt, 'poc:reserved');`, parameters: values,
    }), row => decode(row, this.enableProgress));
    if (!result || result.state !== 'poc:reserved') throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return result;
  }
  async complete(id: IdempotencyRecordId, expectedVersion: Version, outcome: ReportOperationOutcome, completedAt: UtcInstant): Promise<CompletedIdempotency> {
    if (outcome.progress !== undefined && !this.enableProgress) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    if (this.enableProgress) await requireProgressSchema(this.session);
    const progressJson = outcome.progress === undefined ? null : progressSnapshot.encode(outcome.progress);
    const { json, historical, auditId, date } = mapped(() => {
      const json = reportSnapshot.encode(outcome.report);
      return { json, historical: reportSnapshot.decode(json),
        auditId: identifier('audit-event').decode(outcome.auditEventId), date: instant.encode(completedAt) };
    });
    const current = await this.findById(id);
    if (!current) return notFound();
    const expected = expectedBytes(current.version, expectedVersion);
    if (current.state !== 'poc:reserved') return incompatible();
    await requireReference(this.session, 'Reports', historical.id);
    const event = await new SqlAuditRepository(this.session, this.enableProgress).findById(auditId);
    if (!event) return notFound();
    if (outcome.progress) {
      const progress = progressSnapshot.decode(progressJson);
      const operation = progress.kind === 'evidence' ? 'poc:associate-evidence' : 'poc:submit-report';
      const action = progress.kind === 'evidence' ? 'poc:evidence-declared' : 'poc:report-submitted';
      if (current.scope.operation !== operation || event.actorId !== current.scope.actorId || event.change.action !== action
        || !('progress' in event.change) || canonical(event.change.progress) !== canonical(progress)
        || reportSnapshot.encode(event.change.after) !== json) return incompatible();
    } else if ((current.scope.operation !== 'poc:create-report' && current.scope.operation !== 'poc:update-report')
      || (event.change.action !== 'poc:report-created' && event.change.action !== 'poc:report-updated')
      || reportSnapshot.encode(event.change.after) !== json) return incompatible();
    const result = single(await queryRows(this.session, {
      text: `UPDATE pai.IdempotencyRecords SET State='poc:completed', CompletedAt=@completedAt, OutcomeReportId=@reportId, OutcomeAuditEventId=@auditId, OutcomeReportJson=@reportJson${this.enableProgress ? ", OutcomeProgressJson=@progressJson" : ""} OUTPUT ${this.output} WHERE Id=@id AND RV=@expectedVersion AND State='poc:reserved';`, parameters: [
        { name: 'id', type: 'varchar', length: 64, value: identifier('idempotency-record').encode(id) },
        { name: 'expectedVersion', type: 'binary', length: 8, value: expected },
        { name: 'completedAt', type: 'datetime2', scale: 3, value: date },
        { name: 'reportId', type: 'varchar', length: 64, value: historical.id },
        { name: 'auditId', type: 'varchar', length: 64, value: auditId },
        { name: 'reportJson', type: 'nvarchar', length: 'max', value: json },
        ...(this.enableProgress ? [{ name: 'progressJson', type: 'nvarchar' as const, length: 'max' as const, value: progressJson }] : []),
      ],
    }), row => decode(row, this.enableProgress));
    if (!result) return conflict();
    if (result.state !== 'poc:completed') throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return result;
  }
}
