import type { ProgressRepository } from '../../../application/ports/progress.js';
import type { Report } from '../../../domain/entities.js';
import type { DeclaredEvidence, SubmittedReport } from '../../../domain/evidence.js';
import type { ReportId } from '../../../domain/types.js';
import { identifier, instant, nullable, reportSnapshot, rowversion } from '../codecs.js';
import { SqlInfrastructureError } from '../errors.js';
import { canonical, declaration, submission } from '../progressCodecs.js';
import type { SqlParameter, SqlSession } from '../session.js';
import { SqlReportRepository } from './report.js';
import { conflict, duplicate, expectedBytes, incompatible, mapped, notFound, queryRows, single } from './shared.js';

// Metadata visible through existing object permissions. Never reads protected migration history.
export async function requireProgressSchema(session: SqlSession): Promise<void> {
  const rows = await queryRows(session, { text: `SELECT CASE WHEN
    COL_LENGTH('pai.ReportEvidence','ReportVersion')=8 AND COL_LENGTH('pai.ReportSubmissions','SnapshotJson')=-1
    AND COL_LENGTH('pai.EvidenceVerifications','VerificationJson')=-1 AND OBJECT_ID('pai.ActivityGoals','U') IS NOT NULL
    AND COL_LENGTH('pai.AuditEvents','ProgressJson')=-1 AND COL_LENGTH('pai.IdempotencyRecords','OutcomeProgressJson')=-1
    THEN 1 ELSE 0 END AS ProgressSchemaCompatible;`, parameters: [] });
  if (rows.length !== 1 || rows[0].ProgressSchemaCompatible !== 1) throw new SqlInfrastructureError('SQL_SCHEMA_INCOMPATIBLE');
}
const columns = 'Id, ReportId, ActivityId, TargetKind, GoalId, StorageReference, FileName, MediaType, SizeBytes, DeclaredBy, DeclaredAt, ReportVersion';
const idParameter = (id: ReportId): SqlParameter => ({ name: 'reportId', type: 'varchar', length: 64, value: identifier('report').encode(id) });
function decode(row: Readonly<Record<string, unknown>>): DeclaredEvidence {
  return mapped(() => declaration({ id: identifier('evidence').decode(row.Id), reportId: identifier('report').decode(row.ReportId),
    target: row.TargetKind === 'activity' && row.GoalId === null ? { kind: 'activity', activityId: identifier('activity').decode(row.ActivityId) }
      : row.TargetKind === 'goal' ? { kind: 'goal', activityId: identifier('activity').decode(row.ActivityId), goalId: identifier('goal').decode(row.GoalId) }
      : (() => { throw new Error(); })(),
    storageReference: row.StorageReference as string, name: row.FileName as string, mediaType: row.MediaType as string,
    sizeBytes: typeof row.SizeBytes === 'string' && /^(0|[1-9][0-9]*)$/.test(row.SizeBytes) ? Number(row.SizeBytes) : NaN,
    status: 'declared', declaredBy: identifier('user').decode(row.DeclaredBy), declaredAt: instant.decode(row.DeclaredAt), version: rowversion.decode(row.ReportVersion) }));
}
export class SqlProgressRepository implements ProgressRepository {
  constructor(private readonly session: SqlSession) {}
  async listEvidence(id: ReportId): Promise<readonly DeclaredEvidence[]> {
    await requireProgressSchema(this.session);
    return (await queryRows(this.session, { text: `SELECT ${columns} FROM pai.ReportEvidence WHERE ReportId=@reportId ORDER BY InsertionOrder ASC;`,
      parameters: [idParameter(id)] })).map(decode);
  }
  async findSubmission(id: ReportId): Promise<SubmittedReport | null> {
    await requireProgressSchema(this.session);
    const row = single(await queryRows(this.session, { text: 'SELECT ReportId, InstitutionalState, FromState, SubmittedBy, SubmittedAt, PolicyVersion, ReportVersion, SnapshotJson FROM pai.ReportSubmissions WHERE ReportId=@reportId;', parameters: [idParameter(id)] }), value => value);
    if (!row) return null;
    const result = mapped(() => submission(JSON.parse(row.SnapshotJson as string) as SubmittedReport));
    if (result.report.id !== id || row.ReportId !== id || row.InstitutionalState !== result.state || row.FromState !== result.from
        || row.SubmittedBy !== result.submittedBy || instant.decode(row.SubmittedAt) !== result.submittedAt
        || row.PolicyVersion !== result.policyVersion || rowversion.decode(row.ReportVersion) !== result.report.version) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    const proofs = await queryRows(this.session, { text: 'SELECT EvidenceId, VerifiedAt, AuthorizedForUserId, VerificationJson FROM pai.EvidenceVerifications WHERE ReportId=@reportId ORDER BY EvidenceId;', parameters: [idParameter(id)] });
    if (proofs.length !== result.evidence.length || new Set(proofs.map(p => p.EvidenceId)).size !== proofs.length
        || result.evidence.some(item => !proofs.some(p => p.EvidenceId === item.declaration.id && instant.decode(p.VerifiedAt) === item.file.verifiedAt
          && p.AuthorizedForUserId === item.file.authorizedForUserId && mapped(() => canonical(JSON.parse(p.VerificationJson as string))) === canonical(item.file)))) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return result;
  }
  private async current(report: Report): Promise<void> {
    const current = await new SqlReportRepository(this.session).findById(report.id);
    if (!current) return notFound();
    expectedBytes(current.version, report.version);
    if (canonical(current) !== canonical(report)) return incompatible();
    if (await this.findSubmission(report.id)) return incompatible();
  }
  async addEvidence(report: Report, value: DeclaredEvidence): Promise<void> {
    report = reportSnapshot.decode(reportSnapshot.encode(report));
    const input = declaration(value);
    await requireProgressSchema(this.session);
    if (input.reportId !== report.id || input.target.activityId !== report.activityId || input.version !== report.version
        || input.declaredBy !== report.updatedBy || input.declaredAt !== report.updatedAt) return incompatible();
    await this.current(report);
    const duplicateRows = await queryRows(this.session, { text: 'SELECT Id FROM pai.ReportEvidence WHERE Id=@id;', parameters: [{ name: 'id', type: 'varchar', length: 64, value: input.id }] });
    if (duplicateRows.length) return duplicate();
    if (input.target.kind === 'goal') {
      const rows = await queryRows(this.session, { text: 'SELECT GoalId FROM pai.ActivityGoals WHERE ActivityId=@activityId AND GoalId=@goalId;', parameters: [
        { name: 'activityId', type: 'varchar', length: 64, value: input.target.activityId }, { name: 'goalId', type: 'varchar', length: 64, value: input.target.goalId }] });
      if (rows.length !== 1 || rows[0].GoalId !== input.target.goalId) return incompatible();
    }
    const parameters: SqlParameter[] = [
      { name: 'id', type: 'varchar', length: 64, value: input.id }, idParameter(input.reportId),
      { name: 'activityId', type: 'varchar', length: 64, value: input.target.activityId },
      { name: 'targetKind', type: 'varchar', length: 8, value: input.target.kind },
      { name: 'goalId', type: 'varchar', length: 64, value: nullable(identifier('goal')).encode(input.target.kind === 'goal' ? input.target.goalId : null) },
      { name: 'storageReference', type: 'varchar', length: 256, value: input.storageReference },
      { name: 'fileName', type: 'nvarchar', length: 128, value: input.name },
      { name: 'mediaType', type: 'varchar', length: 127, value: input.mediaType },
      { name: 'sizeBytes', type: 'bigint', value: String(input.sizeBytes) },
      { name: 'declaredBy', type: 'varchar', length: 64, value: input.declaredBy },
      { name: 'declaredAt', type: 'datetime2', scale: 3, value: instant.encode(input.declaredAt) },
      { name: 'reportVersion', type: 'binary', length: 8, value: rowversion.encode(input.version) },
    ];
    const rows = await queryRows(this.session, { text: `INSERT INTO pai.ReportEvidence (${columns}) OUTPUT INSERTED.Id VALUES (@id,@reportId,@activityId,@targetKind,@goalId,@storageReference,@fileName,@mediaType,@sizeBytes,@declaredBy,@declaredAt,@reportVersion);`, parameters });
    if (rows.length !== 1 || rows[0].Id !== input.id) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
  }
  async submit(value: SubmittedReport): Promise<void> {
    const input = submission(value);
    if (input.submittedBy !== input.report.updatedBy || input.submittedAt !== input.report.updatedAt) return incompatible();
    await requireProgressSchema(this.session);
    await this.current(input.report);
    const existing = await this.listEvidence(input.report.id);
    if (existing.length !== input.evidence.length || existing.some(item => !input.evidence.some(accepted => canonical(accepted.declaration) === canonical(item)))) return incompatible();
    const rows = await queryRows(this.session, { text: `INSERT INTO pai.ReportSubmissions (ReportId,FromState,InstitutionalState,SubmittedBy,SubmittedAt,PolicyVersion,ReportVersion,SnapshotJson)
      OUTPUT INSERTED.ReportId SELECT @reportId,'Abierto','Enviado',@actor,@at,@policy,@version,@snapshot
      WHERE EXISTS (SELECT 1 FROM pai.Reports WHERE Id=@reportId AND RV=@version);`, parameters: [idParameter(input.report.id),
      { name: 'actor', type: 'varchar', length: 64, value: identifier('user').encode(input.submittedBy) },
      { name: 'at', type: 'datetime2', scale: 3, value: instant.encode(input.submittedAt) },
      { name: 'policy', type: 'varchar', length: 128, value: input.policyVersion },
      { name: 'version', type: 'binary', length: 8, value: rowversion.encode(input.report.version) },
      { name: 'snapshot', type: 'nvarchar', length: 'max', value: JSON.stringify(input) }] });
    if (rows.length === 0) return conflict();
    if (rows.length !== 1 || rows[0].ReportId !== input.report.id) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    for (const item of input.evidence) {
      const inserted = await queryRows(this.session, { text: `INSERT INTO pai.EvidenceVerifications (ReportId,EvidenceId,VerifiedAt,AuthorizedForUserId,VerificationJson)
        OUTPUT INSERTED.EvidenceId VALUES (@reportId,@evidenceId,@at,@actor,@proof);`, parameters: [idParameter(input.report.id),
        { name: 'evidenceId', type: 'varchar', length: 64, value: item.declaration.id },
        { name: 'at', type: 'datetime2', scale: 3, value: instant.encode(item.file.verifiedAt) },
        { name: 'actor', type: 'varchar', length: 64, value: item.file.authorizedForUserId },
        { name: 'proof', type: 'nvarchar', length: 'max', value: JSON.stringify(item.file) }] });
      if (inserted.length !== 1 || inserted[0].EvidenceId !== item.declaration.id) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    }
  }
}
