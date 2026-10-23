import type { IdempotencyRepository, NewReservation } from '../../../application/ports/repositories.js';
import type { CompletedIdempotency, IdempotencyRecord, IdempotencyScope, ReportOperationOutcome, ReservedIdempotency } from '../../../domain/entities.js';
import type { IdempotencyRecordId, UtcInstant, Version } from '../../../domain/types.js';
import { fingerprint, idempotency, idempotencyState, identifier, instant, operation, reportSnapshot, rowversion } from '../codecs.js';
import { SqlInfrastructureError } from '../errors.js';
import type { SqlSession } from '../session.js';
import { SqlAuditRepository } from './audit.js';
import { conflict, duplicate, expectedBytes, incompatible, mapped, notFound, queryRows, requireReference, single } from './shared.js';

const columns = 'Id, ActorId, Operation, IdempotencyKey, RequestFingerprint, CreatedAt, State, CompletedAt, OutcomeReportId, OutcomeAuditEventId, OutcomeReportJson, RV';
const select = `SELECT ${columns} FROM pai.IdempotencyRecords`;
const output = columns.split(', ').map(c => `INSERTED.${c}`).join(', ');
function decode(row: Readonly<Record<string, unknown>>): IdempotencyRecord {
  return mapped(() => {
    const base = { id: identifier('idempotency-record').decode(row.Id), scope: {
      actorId: identifier('user').decode(row.ActorId), operation: operation.decode(row.Operation), key: idempotency.decode(row.IdempotencyKey),
    }, requestFingerprint: fingerprint.decode(row.RequestFingerprint), createdAt: instant.decode(row.CreatedAt), version: rowversion.decode(row.RV) };
    const state = idempotencyState.decode(row.State);
    if (state === 'poc:reserved') {
      if ([row.CompletedAt, row.OutcomeReportId, row.OutcomeAuditEventId, row.OutcomeReportJson].some(v => v !== null)) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      return { ...base, state, completedAt: null, outcome: null };
    }
    const report = reportSnapshot.decode(row.OutcomeReportJson);
    if (report.id !== identifier('report').decode(row.OutcomeReportId)) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return { ...base, state, completedAt: instant.decode(row.CompletedAt), outcome: {
      report, auditEventId: identifier('audit-event').decode(row.OutcomeAuditEventId),
    } };
  });
}
export class SqlIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly session: SqlSession) {}
  private async findById(id: IdempotencyRecordId): Promise<IdempotencyRecord | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE Id=@id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('idempotency-record').encode(id) },
    ] }), decode);
  }
  async findByScope(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE ActorId=@actorId AND Operation=@operation AND IdempotencyKey=@key;`, parameters: mapped(() => [
      { name: 'actorId', type: 'varchar', length: 64, value: identifier('user').encode(scope.actorId) },
      { name: 'operation', type: 'varchar', length: 40, value: operation.encode(scope.operation) },
      { name: 'key', type: 'varchar', length: 128, value: idempotency.encode(scope.key) },
    ]) }), decode);
  }
  async reserve(request: NewReservation): Promise<ReservedIdempotency> {
    const input = mapped(() => structuredClone(request));
    const values = mapped(() => [
      { name: 'id', type: 'varchar' as const, length: 64, value: identifier('idempotency-record').encode(input.id) },
      { name: 'actorId', type: 'varchar' as const, length: 64, value: identifier('user').encode(input.scope.actorId) },
      { name: 'operation', type: 'varchar' as const, length: 40, value: operation.encode(input.scope.operation) },
      { name: 'key', type: 'varchar' as const, length: 128, value: idempotency.encode(input.scope.key) },
      { name: 'fingerprint', type: 'varchar' as const, length: 64, value: fingerprint.encode(input.requestFingerprint) },
      { name: 'createdAt', type: 'datetime2' as const, scale: 3, value: instant.encode(input.createdAt) },
    ]);
    if (await this.findById(input.id) || await this.findByScope(input.scope)) return duplicate();
    await requireReference(this.session, 'InstitutionalUsers', input.scope.actorId);
    const result = single(await queryRows(this.session, {
      text: `INSERT INTO pai.IdempotencyRecords (Id, ActorId, Operation, IdempotencyKey, RequestFingerprint, CreatedAt, State) OUTPUT ${output} VALUES (@id, @actorId, @operation, @key, @fingerprint, @createdAt, 'poc:reserved');`, parameters: values,
    }), decode);
    if (!result || result.state !== 'poc:reserved') throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return result;
  }
  async complete(id: IdempotencyRecordId, expectedVersion: Version, outcome: ReportOperationOutcome, completedAt: UtcInstant): Promise<CompletedIdempotency> {
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
    const event = await new SqlAuditRepository(this.session).findById(auditId);
    if (!event) return notFound();
    if ((event.change.action !== 'poc:report-created' && event.change.action !== 'poc:report-updated')
        || reportSnapshot.encode(event.change.after) !== json) return incompatible();
    const result = single(await queryRows(this.session, {
      text: `UPDATE pai.IdempotencyRecords SET State='poc:completed', CompletedAt=@completedAt, OutcomeReportId=@reportId, OutcomeAuditEventId=@auditId, OutcomeReportJson=@reportJson OUTPUT ${output} WHERE Id=@id AND RV=@expectedVersion AND State='poc:reserved';`, parameters: [
        { name: 'id', type: 'varchar', length: 64, value: identifier('idempotency-record').encode(id) },
        { name: 'expectedVersion', type: 'binary', length: 8, value: expected },
        { name: 'completedAt', type: 'datetime2', scale: 3, value: date },
        { name: 'reportId', type: 'varchar', length: 64, value: historical.id },
        { name: 'auditId', type: 'varchar', length: 64, value: auditId },
        { name: 'reportJson', type: 'nvarchar', length: 'max', value: json },
      ],
    }), decode);
    if (!result) return conflict();
    if (result.state !== 'poc:completed') throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return result;
  }
}
