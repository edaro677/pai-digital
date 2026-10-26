import type { AuditRepository } from '../../../application/ports/repositories.js';
import type { AuditChange, AuditEvent } from '../../../domain/entities.js';
import type { AuditEventId } from '../../../domain/types.js';
import { assignmentSnapshot, auditAction, correlation, identifier, instant, reportSnapshot, userSnapshot } from '../codecs.js';
import { canonical, progressSnapshot } from '../progressCodecs.js';
import { requireProgressSchema } from './progress.js';
import { SqlInfrastructureError } from '../errors.js';
import type { SqlSession } from '../session.js';
import { duplicate, mapped, queryRows, requireReference, single } from './shared.js';

const select = 'SELECT Id, ActorId, OccurredAt, CorrelationId, Action, BeforeJson, AfterJson FROM pai.AuditEvents';
const isProgress = (value: string) => value === 'poc:evidence-declared' || value === 'poc:report-submitted';
function action(value: unknown, enabled: boolean): AuditChange['action'] {
  if (enabled && typeof value === 'string' && isProgress(value)) return value as AuditChange['action'];
  return auditAction.decode(value);
}
function change(row: Readonly<Record<string, unknown>>, enabled: boolean): AuditChange {
  const kind = action(row.Action, enabled);
  if (isProgress(kind)) {
    const progress = progressSnapshot.decode(row.ProgressJson);
    const before = reportSnapshot.decode(row.BeforeJson), after = reportSnapshot.decode(row.AfterJson);
    const event: AuditChange = { action: kind as 'poc:evidence-declared' | 'poc:report-submitted', before, after, progress };
    checkProgress(event);
    return event;
  }
  if (enabled && row.ProgressJson !== null) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
  switch (kind) {
    case 'poc:report-created':
      if (row.BeforeJson !== null) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      return { action: 'poc:report-created', before: null, after: reportSnapshot.decode(row.AfterJson) };
    case 'poc:report-updated': return { action: 'poc:report-updated', before: reportSnapshot.decode(row.BeforeJson), after: reportSnapshot.decode(row.AfterJson) };
    case 'poc:user-enabled-changed': return { action: 'poc:user-enabled-changed', before: userSnapshot.decode(row.BeforeJson), after: userSnapshot.decode(row.AfterJson) };
    case 'poc:assignment-enabled-changed': return { action: 'poc:assignment-enabled-changed', before: assignmentSnapshot.decode(row.BeforeJson), after: assignmentSnapshot.decode(row.AfterJson) };
  }
}
function decode(row: Readonly<Record<string, unknown>>, enabled: boolean): AuditEvent {
  return mapped(() => ({ id: identifier('audit-event').decode(row.Id), actorId: identifier('user').decode(row.ActorId),
    occurredAt: instant.decode(row.OccurredAt), correlationId: correlation.decode(row.CorrelationId), change: change(row, enabled) }));
}
function checkProgress(input: Extract<AuditChange, { progress: unknown }>): void {
  const value = progressSnapshot.decode(progressSnapshot.encode(input.progress));
  if ((input.action === 'poc:evidence-declared' && (value.kind !== 'evidence' || value.evidence.reportId !== input.after.id || value.evidence.target.activityId !== input.after.activityId || value.evidence.version !== input.after.version))
    || (input.action === 'poc:report-submitted' && (value.kind !== 'submission' || canonical(value.submission.report) !== canonical(input.after)))) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
}
function snapshots(input: AuditChange, enabled: boolean): { before: string | null; after: string } {
  action(input.action, enabled);
  switch (input.action) {
    case 'poc:report-created':
      if (input.before !== null) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      return { before: null, after: reportSnapshot.encode(input.after) };
    case 'poc:report-updated': return { before: reportSnapshot.encode(input.before), after: reportSnapshot.encode(input.after) };
    case 'poc:user-enabled-changed': return { before: userSnapshot.encode(input.before), after: userSnapshot.encode(input.after) };
    case 'poc:assignment-enabled-changed': return { before: assignmentSnapshot.encode(input.before), after: assignmentSnapshot.encode(input.after) };
    case 'poc:evidence-declared': case 'poc:report-submitted':
      checkProgress(input);
      return { before: reportSnapshot.encode(input.before), after: reportSnapshot.encode(input.after) };
  }
}
export class SqlAuditRepository implements AuditRepository {
  constructor(private readonly session: SqlSession, private readonly enableProgress = false) {}
  async findById(id: AuditEventId): Promise<AuditEvent | null> {
    return single(await queryRows(this.session, { text: `${select.replace('AfterJson FROM', this.enableProgress ? 'AfterJson, ProgressJson FROM' : 'AfterJson FROM')} WHERE Id = @id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('audit-event').encode(id) },
    ] }), row => decode(row, this.enableProgress));
  }
  async append(event: AuditEvent): Promise<void> {
    const parameters = mapped(() => {
      const json = snapshots(event.change, this.enableProgress);
      return [
        { name: 'id', type: 'varchar' as const, length: 64, value: identifier('audit-event').encode(event.id) },
        { name: 'actorId', type: 'varchar' as const, length: 64, value: identifier('user').encode(event.actorId) },
        { name: 'occurredAt', type: 'datetime2' as const, scale: 3, value: instant.encode(event.occurredAt) },
        { name: 'correlationId', type: 'varchar' as const, length: 64, value: correlation.encode(event.correlationId) },
        { name: 'action', type: 'varchar' as const, length: 40, value: action(event.change.action, this.enableProgress) },
        { name: 'beforeJson', type: 'nvarchar' as const, length: 'max' as const, value: json.before },
        { name: 'afterJson', type: 'nvarchar' as const, length: 'max' as const, value: json.after },
      ];
    });
    if (this.enableProgress) {
      await requireProgressSchema(this.session);
      parameters.push({ name: 'progressJson', type: 'nvarchar', length: 'max', value: 'progress' in event.change ? progressSnapshot.encode(event.change.progress) : null });
      if ('progress' in event.change) {
        const value = event.change.progress;
        if (value.kind === 'evidence' ? value.evidence.declaredBy !== event.actorId || value.evidence.declaredAt !== event.occurredAt
          : value.submission.submittedBy !== event.actorId || value.submission.submittedAt !== event.occurredAt) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      }
    }
    const id = identifier('audit-event').decode(parameters[0].value);
    if (await this.findById(id)) return duplicate();
    await requireReference(this.session, 'InstitutionalUsers', parameters[1].value as string);
    const rows = await queryRows(this.session, {
      text: `INSERT INTO pai.AuditEvents (Id, ActorId, OccurredAt, CorrelationId, Action, BeforeJson, AfterJson${this.enableProgress ? ', ProgressJson' : ''}) OUTPUT INSERTED.Id VALUES (@id, @actorId, @occurredAt, @correlationId, @action, @beforeJson, @afterJson${this.enableProgress ? ', @progressJson' : ''});`, parameters,
    });
    if (rows.length !== 1 || rows[0].Id !== id) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
  }
}
