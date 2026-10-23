import type { AuditRepository } from '../../../application/ports/repositories.js';
import type { AuditChange, AuditEvent } from '../../../domain/entities.js';
import type { AuditEventId } from '../../../domain/types.js';
import { assignmentSnapshot, auditAction, correlation, identifier, instant, reportSnapshot, userSnapshot } from '../codecs.js';
import { SqlInfrastructureError } from '../errors.js';
import type { SqlSession } from '../session.js';
import { duplicate, mapped, queryRows, requireReference, single } from './shared.js';

const select = 'SELECT Id, ActorId, OccurredAt, CorrelationId, Action, BeforeJson, AfterJson FROM pai.AuditEvents';
function change(row: Readonly<Record<string, unknown>>): AuditChange {
  switch (auditAction.decode(row.Action)) {
    case 'poc:report-created':
      if (row.BeforeJson !== null) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      return { action: 'poc:report-created', before: null, after: reportSnapshot.decode(row.AfterJson) };
    case 'poc:report-updated': return { action: 'poc:report-updated', before: reportSnapshot.decode(row.BeforeJson), after: reportSnapshot.decode(row.AfterJson) };
    case 'poc:user-enabled-changed': return { action: 'poc:user-enabled-changed', before: userSnapshot.decode(row.BeforeJson), after: userSnapshot.decode(row.AfterJson) };
    case 'poc:assignment-enabled-changed': return { action: 'poc:assignment-enabled-changed', before: assignmentSnapshot.decode(row.BeforeJson), after: assignmentSnapshot.decode(row.AfterJson) };
  }
}
function decode(row: Readonly<Record<string, unknown>>): AuditEvent {
  return mapped(() => ({ id: identifier('audit-event').decode(row.Id), actorId: identifier('user').decode(row.ActorId),
    occurredAt: instant.decode(row.OccurredAt), correlationId: correlation.decode(row.CorrelationId), change: change(row) }));
}
function snapshots(input: AuditChange): { before: string | null; after: string } {
  auditAction.encode(input.action);
  switch (input.action) {
    case 'poc:report-created':
      if (input.before !== null) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      return { before: null, after: reportSnapshot.encode(input.after) };
    case 'poc:report-updated': return { before: reportSnapshot.encode(input.before), after: reportSnapshot.encode(input.after) };
    case 'poc:user-enabled-changed': return { before: userSnapshot.encode(input.before), after: userSnapshot.encode(input.after) };
    case 'poc:assignment-enabled-changed': return { before: assignmentSnapshot.encode(input.before), after: assignmentSnapshot.encode(input.after) };
  }
}
export class SqlAuditRepository implements AuditRepository {
  constructor(private readonly session: SqlSession) {}
  async findById(id: AuditEventId): Promise<AuditEvent | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE Id = @id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('audit-event').encode(id) },
    ] }), decode);
  }
  async append(event: AuditEvent): Promise<void> {
    const parameters = mapped(() => {
      const json = snapshots(event.change);
      return [
        { name: 'id', type: 'varchar' as const, length: 64, value: identifier('audit-event').encode(event.id) },
        { name: 'actorId', type: 'varchar' as const, length: 64, value: identifier('user').encode(event.actorId) },
        { name: 'occurredAt', type: 'datetime2' as const, scale: 3, value: instant.encode(event.occurredAt) },
        { name: 'correlationId', type: 'varchar' as const, length: 64, value: correlation.encode(event.correlationId) },
        { name: 'action', type: 'varchar' as const, length: 40, value: auditAction.encode(event.change.action) },
        { name: 'beforeJson', type: 'nvarchar' as const, length: 'max' as const, value: json.before },
        { name: 'afterJson', type: 'nvarchar' as const, length: 'max' as const, value: json.after },
      ];
    });
    const id = identifier('audit-event').decode(parameters[0].value);
    if (await this.findById(id)) return duplicate();
    await requireReference(this.session, 'InstitutionalUsers', parameters[1].value as string);
    const rows = await queryRows(this.session, {
      text: 'INSERT INTO pai.AuditEvents (Id, ActorId, OccurredAt, CorrelationId, Action, BeforeJson, AfterJson) OUTPUT INSERTED.Id VALUES (@id, @actorId, @occurredAt, @correlationId, @action, @beforeJson, @afterJson);', parameters,
    });
    if (rows.length !== 1 || rows[0].Id !== id) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
  }
}
