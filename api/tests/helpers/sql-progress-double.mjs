import assert from 'node:assert/strict';
import { fixtures, reportInput } from '../fixtures/memory.mjs';
import { SqlSessionRunner } from '../../.local-build/infrastructure/sql/session.js';
import { SqlUnitOfWork } from '../../.local-build/infrastructure/sql/unitOfWork.js';

const bytes = n => Uint8Array.from([0,0,0,0,0,0,Math.floor(n/256),n%256]);
// SQL-shaped transport double, NOT a SQL engine or proof of server constraints/atomicity.
export function sqlProgressDouble(options = {}) {
  const fixture = fixtures();
  const report = { ...reportInput(fixture, { period: '2026-Q4' }), version: 'rv1:0000000000000001' };
  const base = fixture.seed;
  let db = {
    InstitutionalUsers: base.users.map(r => ({Id:r.id,TenantId:r.tenantId,DirectoryObjectId:r.directoryObjectId,Alias:r.alias,Enabled:r.enabled,RV:bytes(1)})),
    Fichas: base.fichas.map(r => ({Id:r.id,DependencyId:r.dependencyId,CycleLabel:r.cycleLabel,RV:bytes(1)})),
    Activities: base.activities.map(r => ({Id:r.id,FichaId:r.fichaId,Description:r.description,RV:bytes(1)})),
    AccessAssignments: base.assignments.map(r => ({Id:r.id,UserId:r.userId,FichaId:r.fichaId,Capability:r.capability,Enabled:r.enabled,ValidFrom:new Date(r.validFrom),ValidUntil:null,RV:bytes(1)})),
    Reports: [{Id:report.id,ActivityId:report.activityId,PeriodKey:report.period,QuantityText:report.quantity,Narrative:report.narrative,
      State:report.state,CreatedBy:report.createdBy,CreatedAt:new Date(report.createdAt),UpdatedBy:report.updatedBy,UpdatedAt:new Date(report.updatedAt),RV:bytes(1)}],
    ActivityGoals: (options.goals ?? []).map(GoalId => ({ActivityId:report.activityId,GoalId})),
    ReportEvidence: [], ReportSubmissions: [], EvidenceVerifications: [], AuditEvents: [], IdempotencyRecords: [],
  };
  let counter = 10;
  const events = [], statements = [], owners = [];
  const transport = { async connect() {
    events.push('connect');
    let draft;
    const tx = { async execute(s) {
      statements.push(structuredClone(s)); owners.push(tx); events.push('query');
      if (options.fail?.(s)) throw Object.assign(new Error('private synthetic driver detail'), {number:547});
      if (s.text.includes('ProgressSchemaCompatible')) return [{ProgressSchemaCompatible:options.compatible === false ? 0 : 1}];
      const p = Object.fromEntries(s.parameters.map(v => [v.name,v.value]));
      const table = s.text.match(/(?:FROM|INTO|UPDATE) pai\.(\w+)/)?.[1];
      assert.ok(table && draft[table], 'unimplemented SQL double statement');
      if (s.text.startsWith('SELECT')) {
        const rows = draft[table].filter(r => {
          if (p.id !== undefined) return r.Id === p.id;
          if (table === 'InstitutionalUsers') return r.TenantId === p.tenantId && r.DirectoryObjectId === p.directoryObjectId;
          if (table === 'AccessAssignments') return r.UserId === p.userId && r.FichaId === p.fichaId;
          if (table === 'IdempotencyRecords') return r.ActorId === p.actorId && r.Operation === p.operation && r.IdempotencyKey === p.key;
          if (table === 'ActivityGoals') return r.ActivityId === p.activityId && r.GoalId === p.goalId;
          if (p.reportId !== undefined) return r.ReportId === p.reportId;
          return false;
        });
        return structuredClone(rows);
      }
      if (s.text.startsWith('INSERT')) {
        let row;
        if (table === 'ReportEvidence') row = {Id:p.id,ReportId:p.reportId,ActivityId:p.activityId,TargetKind:p.targetKind,GoalId:p.goalId,
          StorageReference:p.storageReference,FileName:p.fileName,MediaType:p.mediaType,SizeBytes:p.sizeBytes,DeclaredBy:p.declaredBy,DeclaredAt:p.declaredAt,ReportVersion:p.reportVersion};
        if (table === 'ReportSubmissions') {
          if (options.staleInsert) return [];
          assert.deepEqual(draft.Reports.find(r=>r.Id===p.reportId).RV,p.version);
          row={ReportId:p.reportId,FromState:'Abierto',InstitutionalState:'Enviado',SubmittedBy:p.actor,SubmittedAt:p.at,PolicyVersion:p.policy,ReportVersion:p.version,SnapshotJson:p.snapshot};
        }
        if (table === 'EvidenceVerifications') row={ReportId:p.reportId,EvidenceId:p.evidenceId,VerifiedAt:p.at,AuthorizedForUserId:p.actor,VerificationJson:p.proof};
        if (table === 'AuditEvents') row={Id:p.id,ActorId:p.actorId,OccurredAt:p.occurredAt,CorrelationId:p.correlationId,Action:p.action,BeforeJson:p.beforeJson,AfterJson:p.afterJson,ProgressJson:p.progressJson??null};
        if (table === 'IdempotencyRecords') row={Id:p.id,ActorId:p.actorId,Operation:p.operation,IdempotencyKey:p.key,RequestFingerprint:p.fingerprint,CreatedAt:p.createdAt,
          State:'poc:reserved',CompletedAt:null,OutcomeReportId:null,OutcomeAuditEventId:null,OutcomeReportJson:null,OutcomeProgressJson:null,RV:bytes(++counter)};
        assert.ok(row);draft[table].push(row);return structuredClone([row]);
      }
      if (s.text.startsWith('UPDATE')) {
        const row = draft[table].find(r=>r.Id===p.id);
        if (!row || Buffer.compare(Buffer.from(row.RV),Buffer.from(p.expectedVersion))!==0) return [];
        if (table === 'Reports') Object.assign(row,{QuantityText:p.quantity,Narrative:p.narrative,State:p.state,UpdatedBy:p.updatedBy,UpdatedAt:p.updatedAt,RV:bytes(++counter)});
        else if (table === 'IdempotencyRecords') Object.assign(row,{State:'poc:completed',CompletedAt:p.completedAt,OutcomeReportId:p.reportId,OutcomeAuditEventId:p.auditId,
          OutcomeReportJson:p.reportJson,OutcomeProgressJson:p.progressJson??null,RV:bytes(++counter)});
        else assert.fail('unimplemented SQL double update');
        return structuredClone([row]);
      }
      assert.fail('unimplemented SQL double operation');
    }, async commit() {events.push('commit');db=draft;}, async rollback() {events.push('rollback');} };
    return { async begin(isolation) { assert.equal(isolation,'SERIALIZABLE');events.push('begin');draft=structuredClone(db);return tx;}, async close() {events.push('close');} };
  } };
  const runner = new SqlSessionRunner(transport);
  const work = new SqlUnitOfWork(runner, {progress:true});
  return {fixture,report,events,statements,owners,runner,work,rows:table=>structuredClone(db[table]),
    tamper:(table,work)=>work(db[table])};
}
