import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sqlProgressDouble } from './helpers/sql-progress-double.mjs';
import { harness, configuration, signedToken } from './fixtures/identity.mjs';
import { FichaAuthorizationService } from '../.local-build/application/authorization/service.js';
import { ReportProgressService } from '../.local-build/application/reports/progress.js';
import { reportTools } from '../.local-build/infrastructure/reportTools.js';
import { SqlUnitOfWork } from '../.local-build/infrastructure/sql/unitOfWork.js';
import { progressSnapshot } from '../.local-build/infrastructure/sql/progressCodecs.js';

async function setup(options={}) {
  const s=sqlProgressDouble(options),h=harness();let sequence=0,verifies=0;
  const identity=await h.validator.validateAuthorization('Bearer '+await signedToken({oid:s.fixture.seed.users[0].directoryObjectId}));
  const policy={describe:async r=>({complete:true,policyVersion:'approved-test-policy-v1',reportId:r.id,activityId:r.activityId,period:r.period,
    sourceState:'Abierto',submissionAllowed:true,verificationMaxAgeMs:30000,
    targets:[{target:{kind:'activity',activityId:r.activityId},required:true},...(options.goals??[]).map(goalId=>({target:{kind:'goal',activityId:r.activityId,goalId},required:true}))]})};
  const verifier={verify:async(e,c)=>{verifies++;return {status:'verified',storageReference:e.storageReference,storageVersion:'immutable-v1',sha256:'a'.repeat(64),
    mediaType:e.mediaType,sizeBytes:e.sizeBytes,verifiedAt:h.clock.now(),authorizedForReportId:c.report.id,authorizedForUserId:c.actorId};}};
  const service=new ReportProgressService(s.work,new FichaAuthorizationService(configuration.tenantId,h.clock,{isApplicable:()=>!options.deny}),h.clock,
    {...reportTools,id:kind=>`${kind}-sql-progress-${++sequence}`,correlation:()=> 'sql:progress:278'},options.noRules?{}:{policy,verifier});
  const current=()=>s.work.runAtomic(c=>c.reports.findById(s.report.id));
  const command=async(key='submit:1')=>({key,period:s.report.period,expectedVersion:(await current()).version});
  const input=(id='evidence-278',target={kind:'activity',activityId:s.report.activityId})=>({id,target,storageReference:'opaque-278',name:'Evidencia á 😀.pdf',mediaType:'application/pdf',sizeBytes:123});
  const associate=async(e=input(),key='declare:'+e.id)=>service.associate(identity,s.report.id,{...await command(key),evidence:e});
  return {...s,h,identity,service,current,command,input,associate,verifies:()=>verifies};
}
const code=expected=>e=>{assert.equal(e.code,expected);assert.equal(e.stack,undefined);assert.equal(e.originalError,undefined);assert.doesNotMatch(JSON.stringify(e),/private synthetic/);return true;};

test('0002 association SQL: typed parameters, opaque reference, Unicode and historical report RV round trip',async()=>{
  const s=await setup(),r=await s.associate();
  const found=await s.service.list(s.identity,s.report.id);assert.deepEqual(found,[r.result.evidence]);
  const insert=s.statements.find(q=>q.text.startsWith('INSERT INTO pai.ReportEvidence'));
  assert.ok(insert.text.includes('@storageReference'));assert.ok(!insert.text.includes('opaque-278'));
  assert.equal(insert.parameters.find(p=>p.name==='goalId').value,null);
  assert.equal(insert.parameters.find(p=>p.name==='fileName').type,'nvarchar');
  assert.equal(insert.parameters.find(p=>p.name==='sizeBytes').value,'123');
  assert.equal(insert.parameters.find(p=>p.name==='reportVersion').type,'binary');
  assert.match(s.statements.find(q=>q.text.includes('FROM pai.ReportEvidence WHERE ReportId')).text,/ORDER BY InsertionOrder ASC/);
  assert.equal(s.rows('AuditEvents')[0].Action,'poc:evidence-declared');
  assert.equal(s.rows('IdempotencyRecords')[0].State,'poc:completed');
  assert.equal(s.verifies(),0);
});
test('0002 association replay preserves exact historical evidence after another report version',async()=>{
  const s=await setup(),command={...await s.command('declare:replay'),evidence:s.input()};
  const first=await s.service.associate(s.identity,s.report.id,command);await s.associate(s.input('other'));
  assert.deepEqual(await s.service.associate(s.identity,s.report.id,command),first);
  assert.equal(s.rows('ReportEvidence').length,2);assert.equal(s.rows('AuditEvents').length,2);
});
test('0002 goals require exact persisted activity-goal relationship',async()=>{
  const s=await setup({goals:['goal-278']});await s.associate();
  const input=s.input('goal-evidence',{kind:'goal',activityId:s.report.activityId,goalId:'goal-278'});
  await s.associate(input);const result=await s.service.submit(s.identity,s.report.id,await s.command());
  assert.equal(result.result.submission.evidence.length,2);assert.equal(s.rows('EvidenceVerifications').length,2);
  const missing=await setup({goals:['goal-278']});missing.tamper('ActivityGoals',rows=>rows.length=0);
  await assert.rejects(missing.associate(missing.input('goal-evidence',{kind:'goal',activityId:missing.report.activityId,goalId:'goal-278'})),code('INCOMPATIBLE_STATE'));
  assert.equal(missing.rows('ReportEvidence').length,0);assert.equal(missing.rows('IdempotencyRecords').length,0);
});
test('0002 submit stores institutional state, immutable proof and complete historical result, no reconstruction',async()=>{
  const s=await setup();await s.associate();const command=await s.command();
  const sent=await s.service.submit(s.identity,s.report.id,command);
  const read=await s.service.submission(s.identity,s.report.id);assert.deepEqual(read,sent.result.submission);
  assert.equal(s.rows('ReportSubmissions')[0].InstitutionalState,'Enviado');assert.equal(s.rows('Reports')[0].State,'poc-draft');
  assert.deepEqual(await s.service.submit(s.identity,s.report.id,command),sent);assert.equal(s.verifies(),1);
  assert.equal(s.rows('ReportSubmissions').length,1);assert.equal(s.rows('AuditEvents').length,2);
  const idem=s.rows('IdempotencyRecords').find(r=>r.Operation==='poc:submit-report');
  assert.deepEqual(JSON.parse(idem.OutcomeProgressJson),sent.result);
  assert.deepEqual(JSON.parse(s.rows('AuditEvents').find(r=>r.Action==='poc:report-submitted').ProgressJson),sent.result);
  assert.equal(read.report.quantity,s.report.quantity);assert.equal(read.report.narrative,s.report.narrative);
  assert.equal(s.events.filter(e=>e==='connect').length,s.events.filter(e=>e==='close').length);
});
for(const table of ['ReportEvidence','AuditEvents','IdempotencyRecords'])test('0002 declaration rollback on '+table+' failure',async()=>{
  const options={};const s=await setup(options);options.fail=q=>q.text.startsWith((table==='IdempotencyRecords'?'UPDATE':'INSERT INTO')+' pai.'+table);
  const before=s.rows('Reports');await assert.rejects(s.associate(),code('SQL_QUERY_FAILED'));
  assert.deepEqual(s.rows('Reports'),before);for(const name of ['ReportEvidence','AuditEvents','IdempotencyRecords'])assert.equal(s.rows(name).length,0);
  assert.ok(s.events.includes('rollback'));assert.equal(s.events.at(-1),'close');
});
for(const table of ['ReportSubmissions','EvidenceVerifications','AuditEvents','IdempotencyRecords'])test('0002 submit rollback on '+table+' failure',async()=>{
  const options={};const s=await setup(options);await s.associate();const before=s.rows('Reports');
  options.fail=q=>q.text.startsWith((table==='IdempotencyRecords'?'UPDATE':'INSERT INTO')+' pai.'+table);
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('SQL_QUERY_FAILED'));
  assert.deepEqual(s.rows('Reports'),before);assert.equal(s.rows('ReportSubmissions').length,0);assert.equal(s.rows('EvidenceVerifications').length,0);
  assert.equal(s.rows('AuditEvents').length,1);assert.equal(s.rows('IdempotencyRecords').length,1);assert.equal(s.events.at(-1),'close');
});
test('0002 optimistic concurrency rejects valid opaque stale version with no partial rows',async()=>{
  const s=await setup();await assert.rejects(s.service.associate(s.identity,s.report.id,{...await s.command(),expectedVersion:'opaque-stale',evidence:s.input()}),code('VERSION_CONFLICT'));
  assert.equal(s.rows('ReportEvidence').length,0);assert.equal(s.rows('AuditEvents').length,0);
});
test('0002 submission checks report RV in the final INSERT, rolling back the whole outcome on mismatch',async()=>{
  const options={};const s=await setup(options);await s.associate();options.staleInsert=true;
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('VERSION_CONFLICT'));
  assert.equal(s.rows('ReportSubmissions').length,0);assert.equal(s.rows('IdempotencyRecords').length,1);
});
test('0002 authorization denial makes no DML statements',async()=>{
  const s=await setup({deny:true});await assert.rejects(s.associate(),code('ACCESS_DENIED'));
  assert.equal(s.statements.some(q=>/^(INSERT|UPDATE|DELETE)/.test(q.text)),false);
});
test('0002 missing institutional rules stay blocked even with progress-capable SQL UoW',async()=>{
  const s=await setup({noRules:true});await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),e=>e.code==='INCOMPATIBLE_STATE');
  assert.equal(s.statements.some(q=>/^(INSERT|UPDATE)/.test(q.text)),false);
});
test('0002 incompatible schema fails before callback and closes/rolls back, never memory fallback',async()=>{
  const s=await setup({compatible:false});let called=false;
  await assert.rejects(s.work.runAtomic(async()=>{called=true;}),code('SQL_SCHEMA_INCOMPATIBLE'));
  assert.equal(called,false);assert.deepEqual(s.events,['connect','begin','query','rollback','close']);
});
test('0002 default UoW preserves 0001 context and does not silently enable progress',async()=>{
  const s=await setup({compatible:false}),legacy=new SqlUnitOfWork(s.runner);
  await legacy.runAtomic(async c=>{assert.equal(c.progress,undefined);});assert.equal(s.statements.length,0);
});
test('0002 progress facade shares the transaction, is frozen and rejects use after callback',async()=>{
  const s=await setup();let captured;
  await s.work.runAtomic(async c=>{captured=c.progress;assert.equal(Object.isFrozen(c.progress),true);await c.progress.listEvidence(s.report.id);});
  assert.equal(new Set(s.owners).size,1);assert.equal(s.events.filter(e=>e==='commit').length,1);
  await assert.rejects(captured.listEvidence(s.report.id),code('INCOMPATIBLE_STATE'));
});
for(const mutation of ['proof','inventory','actor','snapshot'])test('0002 rejects inconsistent persisted '+mutation,async()=>{
  const s=await setup();await s.associate();await s.service.submit(s.identity,s.report.id,await s.command());
  if(mutation==='proof')s.tamper('EvidenceVerifications',r=>r[0].VerificationJson='{}');
  if(mutation==='inventory')s.tamper('EvidenceVerifications',r=>r.length=0);
  if(mutation==='actor')s.tamper('EvidenceVerifications',r=>r[0].AuthorizedForUserId='different-user');
  if(mutation==='snapshot')s.tamper('ReportSubmissions',r=>r[0].SnapshotJson='{}');
  await assert.rejects(s.service.submission(s.identity,s.report.id),code('SQL_CODEC_INVALID'));
});
test('0002 strict codecs reject unknown fields and preserve independent snapshots',async()=>{
  const s=await setup();const r=await s.associate();
  const json=progressSnapshot.encode(r.result),decoded=progressSnapshot.decode(json);decoded.evidence.name='changed';
  assert.notDeepEqual(decoded,r.result);
  assert.throws(()=>progressSnapshot.encode({...r.result,secret:'not allowed'}),code('SQL_CODEC_INVALID'));
});
test('0002 migration artifacts are reviewed-only, guarded, reversible only without progress data and hash-consistent',()=>{
  const dir=new URL('../migrations/0002_report_progress/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('sha256.json',dir)));
  for(const name of ['up.sql','verify.sql','down.sql'])assert.equal(createHash('sha256').update(readFileSync(new URL(name,dir))).digest('hex'),manifest[name]);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../migrations/0001_initial/up.sql',import.meta.url))).digest('hex'),manifest['0001_initial/up.sql']);
  const up=readFileSync(new URL('up.sql',dir),'utf8'),down=readFileSync(new URL('down.sql',dir),'utf8'),verify=readFileSync(new URL('verify.sql',dir),'utf8');
  for(const sql of [up,down]){assert.match(sql,/BEGIN TRANSACTION/);assert.match(sql,/ROLLBACK TRANSACTION/);assert.match(sql,/LOCAL_PROGRESS_0002/);assert.doesNotMatch(sql,/\b(GRANT|DENY|REVOKE|KILL)\s/i);}
  for(const table of ['ActivityGoals','ReportEvidence','ReportSubmissions','EvidenceVerifications'])assert.match(up,new RegExp('CREATE TABLE pai\\.'+table));
  assert.match(up,/REFERENCES pai\.Reports\(Id,ActivityId\)/);assert.match(down,/Reversion bloqueada/);
  assert.doesNotMatch(verify,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i);
});
