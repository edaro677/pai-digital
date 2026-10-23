import type { NewReport, ReportChanges, ReportRepository } from '../../../application/ports/repositories.js';
import type { Report } from '../../../domain/entities.js';
import type { ActivityId, PeriodKey, ReportId, Version } from '../../../domain/types.js';
import { decimal, identifier, instant, nullable, period, reportState, rowversion, unicodeText } from '../codecs.js';
import { SqlInfrastructureError } from '../errors.js';
import type { SqlParameter, SqlSession } from '../session.js';
import { conflict, duplicate, expectedBytes, mapped, notFound, queryRows, requireReference, single } from './shared.js';

const columns = 'Id, ActivityId, PeriodKey, QuantityText, Narrative, State, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt, RV';
const output = columns.split(', ').map(c => `INSERTED.${c}`).join(', ');
const select = `SELECT ${columns} FROM pai.Reports`;
function decode(row: Readonly<Record<string, unknown>>): Report {
  return mapped(() => ({ id: identifier('report').decode(row.Id), activityId: identifier('activity').decode(row.ActivityId),
    period: period.decode(row.PeriodKey), quantity: nullable(decimal).decode(row.QuantityText),
    narrative: unicodeText.decode(row.Narrative), state: reportState.decode(row.State),
    createdBy: identifier('user').decode(row.CreatedBy), createdAt: instant.decode(row.CreatedAt),
    updatedBy: identifier('user').decode(row.UpdatedBy), updatedAt: instant.decode(row.UpdatedAt), version: rowversion.decode(row.RV) }));
}
function parameters(input: NewReport): SqlParameter[] {
  return mapped(() => [
    { name: 'id', type: 'varchar', length: 64, value: identifier('report').encode(input.id) },
    { name: 'activityId', type: 'varchar', length: 64, value: identifier('activity').encode(input.activityId) },
    { name: 'period', type: 'nvarchar', length: 128, value: period.encode(input.period) },
    { name: 'quantity', type: 'varchar', length: 'max', value: nullable(decimal).encode(input.quantity) },
    { name: 'narrative', type: 'nvarchar', length: 'max', value: unicodeText.encode(input.narrative) },
    { name: 'state', type: 'varchar', length: 40, value: reportState.encode(input.state) },
    { name: 'createdBy', type: 'varchar', length: 64, value: identifier('user').encode(input.createdBy) },
    { name: 'createdAt', type: 'datetime2', scale: 3, value: instant.encode(input.createdAt) },
    { name: 'updatedBy', type: 'varchar', length: 64, value: identifier('user').encode(input.updatedBy) },
    { name: 'updatedAt', type: 'datetime2', scale: 3, value: instant.encode(input.updatedAt) },
  ]);
}
export class SqlReportRepository implements ReportRepository {
  constructor(private readonly session: SqlSession) {}
  async findById(id: ReportId): Promise<Report | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE Id = @id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('report').encode(id) },
    ] }), decode);
  }
  async findByActivityAndPeriod(activityId: ActivityId, key: PeriodKey): Promise<Report | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE ActivityId = @activityId AND PeriodKey = @period;`, parameters: [
      { name: 'activityId', type: 'varchar', length: 64, value: identifier('activity').encode(activityId) },
      { name: 'period', type: 'nvarchar', length: 128, value: period.encode(key) },
    ] }), decode);
  }
  async create(input: NewReport): Promise<Report> {
    const data = mapped(() => structuredClone(input));
    const values = parameters(data);
    if (await this.findById(data.id) || await this.findByActivityAndPeriod(data.activityId, data.period)) return duplicate();
    await requireReference(this.session, 'Activities', data.activityId);
    await requireReference(this.session, 'InstitutionalUsers', data.createdBy);
    await requireReference(this.session, 'InstitutionalUsers', data.updatedBy);
    const result = single(await queryRows(this.session, {
      text: `INSERT INTO pai.Reports (Id, ActivityId, PeriodKey, QuantityText, Narrative, State, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt) OUTPUT ${output} VALUES (@id, @activityId, @period, @quantity, @narrative, @state, @createdBy, @createdAt, @updatedBy, @updatedAt);`, parameters: values,
    }), decode);
    if (!result) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return result;
  }
  async update(id: ReportId, expectedVersion: Version, changes: ReportChanges): Promise<Report> {
    const data = mapped(() => structuredClone(changes));
    const current = await this.findById(id);
    if (!current) return notFound();
    const expected = expectedBytes(current.version, expectedVersion);
    const next = { ...current, quantity: data.quantity, narrative: data.narrative,
      state: data.state, updatedBy: data.updatedBy, updatedAt: data.updatedAt };
    const values = parameters(next).filter(p => ['id', 'quantity', 'narrative', 'state', 'updatedBy', 'updatedAt'].includes(p.name));
    await requireReference(this.session, 'InstitutionalUsers', next.updatedBy);
    const result = single(await queryRows(this.session, {
      text: `UPDATE pai.Reports SET QuantityText=@quantity, Narrative=@narrative, State=@state, UpdatedBy=@updatedBy, UpdatedAt=@updatedAt OUTPUT ${output} WHERE Id=@id AND RV=@expectedVersion;`,
      parameters: [...values, { name: 'expectedVersion', type: 'binary', length: 8, value: expected }],
    }), decode);
    return result ?? conflict();
  }
}
