import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest } from '@azure/functions';
import { fixtures, reportInput } from './fixtures/memory.mjs';
import { harness, signedToken, configuration } from './fixtures/identity.mjs';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { FichaAuthorizationService } from '../.local-build/application/authorization/service.js';
import { ReportProgressService } from '../.local-build/application/reports/progress.js';
import { createApplicationHandlers } from '../.local-build/composition/queries.js';
import { reportTools } from '../.local-build/infrastructure/reportTools.js';
import { validateEvidenceInput } from '../.local-build/domain/evidence.js';
import { SqlAuditRepository } from '../.local-build/infrastructure/sql/repositories/audit.js';
import { SqlIdempotencyRepository } from '../.local-build/infrastructure/sql/repositories/idempotency.js';

const secret='private-driver-message password=synthetic C:\\private\\synthetic';
async function setup(options={}) {
  const f=fixtures(),h=harness();
  const report={...reportInput(f,{period:'2026-Q4'}),version:'initial-report-version'};
  f.seed.reports=[report];
  const memory=new MemoryUnitOfWork(f.seed),faults={audit:false,complete:false};let sequence=0,verifyCalls=0;const generated=[];
  const tools={...reportTools,id:kind=>{const id=`${kind}-progress-${++sequence}`;generated.push({kind,id});return id;},correlation:()=> 'progress:test'};
  const work={runAtomic:cb=>memory.runAtomic(c=>cb({...c,
    ...(options.unsupported?{progress:undefined}:{}),
    audit:{...c.audit,append:async event=>{if(faults.audit)throw new Error(secret);return c.audit.append(event);}},
    idempotency:{...c.idempotency,complete:async(...args)=>{if(faults.complete)throw new Error(secret);return c.idempotency.complete(...args);}},
  }))};
  const authorization=new FichaAuthorizationService(configuration.tenantId,h.clock,
    {isApplicable:options.deny?()=>false:()=>true}); // approved test-only validity double
  const policy={describe:async(row)=>options.noPlan?null:{complete:true,policyVersion:'test-rules-v1',reportId:row.id,
    activityId:row.activityId,period:row.period,sourceState:'Abierto',submissionAllowed:true,verificationMaxAgeMs:30000,
    targets:[{target:{kind:'activity',activityId:row.activityId},required:true},
      ...(options.goals??[]).map(goalId=>({target:{kind:'goal',activityId:row.activityId,goalId},required:true}))],...options.plan}};
  const verifier={verify:async(input,context)=>{
    verifyCalls++;
    const proof={status:'verified',storageReference:input.storageReference,storageVersion:'object-v1',sha256:'a'.repeat(64),
      mediaType:input.mediaType,sizeBytes:input.sizeBytes,verifiedAt:h.clock.now(),
      authorizedForReportId:context.report.id,authorizedForUserId:context.actorId,...options.proof};
    if(options.onVerify)await options.onVerify({memory,h,input,context,proof});
    return proof;
  }};
  const deps={...(options.noPolicy?{}:{policy}),...(options.noVerifier?{}:{verifier})};
  const service=new ReportProgressService(work,authorization,h.clock,tools,deps);
  const handlers=createApplicationHandlers(h.validator,work,authorization,h.clock,tools,deps);
  const jwt=await signedToken({oid:f.seed.users[0].directoryObjectId});
  const identity=await h.validator.validateAuthorization('Bearer '+jwt);
  const current=()=>memory.runAtomic(c=>c.reports.findById(report.id));
  const input=(id='evidence-1',target={kind:'activity',activityId:report.activityId})=>({id,target,
    storageReference:'opaque-object-'+id,name:'Evidencia á 😀.pdf',mediaType:'application/pdf',sizeBytes:123});
  const command=async(key='send:1')=>({key,expectedVersion:(await current()).version,period:report.period});
  const associate=async(evidence=input(),key='associate:'+evidence.id)=>service.associate(identity,report.id,{...await command(key),evidence});
  const http=(name,body,extra={})=>handlers[name](new HttpRequest({method:body===undefined?'GET':'POST',
    url:'http://127.0.0.1:7071/api/poc/reportes/'+report.id+(name==='submitReport'?'/enviar':name==='getSubmission'?'/envio':'/evidencias'),
    params:{reportId:report.id},headers:{Authorization:'Bearer '+jwt,...(body?{'Content-Type':'application/json','Idempotency-Key':body.key??'http:1'}:{})},
    ...(body?{body:{string:JSON.stringify(Object.fromEntries(Object.entries(body).filter(([name])=>name!=='key')))}}:{}),...extra}));
  return {f,h,report,memory,work,faults,tools,identity,jwt,service,handlers,current,input,command,associate,http,verifyCalls:()=>verifyCalls,auditIds:()=>generated.filter(row=>row.kind==='audit-event').map(row=>row.id)};
}
const code=value=>error=>error.code===value;
async function unchanged(s,version){
  await s.memory.runAtomic(async c=>{
    assert.equal((await c.reports.findById(s.report.id)).version,version);
    assert.equal(await c.progress.findSubmission(s.report.id),null);
    assert.equal(await c.idempotency.findByScope({actorId:s.f.alpha,operation:'poc:submit-report',key:'send:1'}),null);
  });
}

test('declared reference is not a verified file; audit and historical idempotency are atomic',async()=>{
  const s=await setup();const command={...await s.command('associate:1'),evidence:s.input()};
  const first=await s.service.associate(s.identity,s.report.id,command);
  assert.equal(first.result.kind,'evidence');assert.equal(first.result.evidence.status,'declared');assert.equal(s.verifyCalls(),0);
  const again=await s.service.associate(s.identity,s.report.id,command);assert.deepEqual(again,first);
  await assert.rejects(s.service.associate(s.identity,s.report.id,{...command,evidence:{...command.evidence,name:'different.pdf'}}),code('DUPLICATE'));
  await s.memory.runAtomic(async c=>{
    assert.equal((await c.progress.listEvidence(s.report.id)).length,1);
    const idem=await c.idempotency.findByScope({actorId:s.f.alpha,operation:'poc:associate-evidence',key:'associate:1'});
    const audit=await c.audit.findById(idem.outcome.auditEventId);
    assert.equal(audit.change.action,'poc:evidence-declared');assert.deepEqual(audit.change.progress,idem.outcome.progress);
  });
});
test('authorized Abierto->Enviado with immutable file proof, historical replay and audited snapshot',async()=>{
  const s=await setup();await s.associate();const command=await s.command();
  const sent=await s.service.submit(s.identity,s.report.id,command);
  assert.equal(sent.result.submission.from,'Abierto');assert.equal(sent.result.submission.state,'Enviado');
  assert.equal(sent.result.submission.evidence[0].status,'valid-for-submission');assert.equal(s.verifyCalls(),1);
  assert.deepEqual(await s.service.submit(s.identity,s.report.id,command),sent);assert.equal(s.verifyCalls(),1);
  await s.memory.runAtomic(async c=>{
    const idem=await c.idempotency.findByScope({actorId:s.f.alpha,operation:'poc:submit-report',key:'send:1'});
    const event=await c.audit.findById(idem.outcome.auditEventId);
    assert.equal(event.change.action,'poc:report-submitted');
    assert.deepEqual(event.change.progress,idem.outcome.progress);
    assert.deepEqual(await c.progress.findSubmission(s.report.id),sent.result.submission);
    assert.equal((await c.reports.findById(s.report.id)).version,sent.version);
  });
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command('another-send')),code('INCOMPATIBLE_STATE'));
  await assert.rejects(s.associate(s.input('after-send')),code('INCOMPATIBLE_STATE'));
  const changed=await s.handlers.updateReport(new HttpRequest({method:'PATCH',url:'http://127.0.0.1/api/poc/reportes/'+s.report.id,
    params:{reportId:s.report.id},headers:{Authorization:'Bearer '+s.jwt,'Content-Type':'application/json','Idempotency-Key':'edit-after-send'},
    body:{string:JSON.stringify({expectedVersion:sent.version,narrative:'not allowed'})}}));
  assert.equal(changed.status,409);
});
test('evidence required independently for activity and goal; missing goal blocks before verification',async()=>{
  const s=await setup({goals:['goal-1']});await s.associate();const original=(await s.current()).version;
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('INCOMPATIBLE_STATE'));
  assert.equal(s.verifyCalls(),0);await unchanged(s,original);
  await s.associate(s.input('goal-evidence',{kind:'goal',activityId:s.report.activityId,goalId:'goal-1'}));
  const sent=await s.service.submit(s.identity,s.report.id,await s.command());assert.equal(sent.result.submission.evidence.length,2);
});
test('missing evidence and stale version do not reserve idempotency or mutate report',async()=>{
  const s=await setup();await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('INCOMPATIBLE_STATE'));
  await unchanged(s,s.report.version);await s.associate();const v=(await s.current()).version;
  await assert.rejects(s.service.submit(s.identity,s.report.id,{...await s.command(),expectedVersion:'stale'}),code('VERSION_CONFLICT'));
  await unchanged(s,v);assert.equal(s.verifyCalls(),0);
});
for(const [name,options]of [
  ['no provider',{noVerifier:true}],['unavailable',{proof:{status:'unavailable'}}],['not found',{proof:{status:'not-found'}}],
  ['wrong size',{proof:{sizeBytes:999}}],['wrong type',{proof:{mediaType:'image/png'}}],['wrong reference',{proof:{storageReference:'other'}}],
  ['bad hash',{proof:{sha256:'bad'}}],['no immutable version',{proof:{storageVersion:''}}],
  ['other report',{proof:{authorizedForReportId:'other'}}],['other actor',{proof:{authorizedForUserId:'other'}}],
  ['future proof',{proof:{verifiedAt:'2000-01-02T00:00:00.000Z'}}],
])test('send rejects unverified/unusable file: '+name,async()=>{
  const s=await setup(options);await s.associate();const v=(await s.current()).version;
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('INCOMPATIBLE_STATE'));await unchanged(s,v);
});
for(const options of [{noPolicy:true},{noPlan:true},{plan:{complete:false}},{plan:{submissionAllowed:false}},
  {plan:{sourceState:'Enviado'}},{plan:{period:'other'}},{plan:{targets:[]}},{unsupported:true}]){
  test('missing rules, permission or transactional capability blocks send: '+JSON.stringify(options),async()=>{
    const s=await setup(options);if(!options.unsupported)await s.associate();const v=(await s.current()).version;
    await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('INCOMPATIBLE_STATE'));await unchanged(s,v);
  });
}
test('foreign ficha and missing report are indistinguishable; no verifier is called',async()=>{
  const s=await setup({deny:true});const body=await s.command();
  assert.equal((await s.http('submitReport',body)).status,404);assert.equal(s.verifyCalls(),0);
  await assert.rejects(s.service.associate(s.identity,s.report.id,{...body,evidence:s.input()}),code('ACCESS_DENIED'));
});
test('invalid period or technical state is blocked',async()=>{
  const s=await setup();await s.associate();
  await assert.rejects(s.service.submit(s.identity,s.report.id,{...await s.command(),period:'other'}),code('INCOMPATIBLE_STATE'));
  await s.memory.runAtomic(async c=>{const r=await c.reports.findById(s.report.id);await c.reports.update(r.id,r.version,{...r,state:'poc-blocked'});});
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('INCOMPATIBLE_STATE'));
});
test('unknown goals and cross-activity declarations are rejected without side effects',async()=>{
  const s=await setup();for(const target of [{kind:'goal',activityId:s.report.activityId,goalId:'unknown'},
    {kind:'activity',activityId:'another-activity'}])await assert.rejects(s.associate(s.input('bad',target)),code('INCOMPATIBLE_STATE'));
  assert.deepEqual(await s.service.list(s.identity,s.report.id),[]);assert.equal((await s.current()).version,s.report.version);
});
for(const failure of ['audit','complete'])test('failure of '+failure+' rolls back report, submission, audit and idempotency',async()=>{
  const s=await setup();await s.associate();const v=(await s.current()).version;const priorAudit=s.auditIds();s.faults[failure]=true;
  const response=await s.http('submitReport',await s.command());assert.equal(response.status,500);
  assert.doesNotMatch(JSON.stringify(response),/private-driver|password|stack/);await unchanged(s,v);
  await s.memory.runAtomic(async c=>{for(const id of s.auditIds().filter(id=>!priorAudit.includes(id)))assert.equal(await c.audit.findById(id),null);});
});
test('association failure rolls back evidence and report together',async()=>{
  const s=await setup();s.faults.audit=true;await assert.rejects(s.associate());
  assert.equal((await s.current()).version,s.report.version);assert.deepEqual(await s.service.list(s.identity,s.report.id),[]);
});
test('concurrent report change during external verification prevents submit',async()=>{
  const s=await setup({onVerify:async({memory,context})=>memory.runAtomic(c=>c.reports.update(context.report.id,context.report.version,
    {...context.report,narrative:'changed concurrently'}))});await s.associate();
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('VERSION_CONFLICT'));
  assert.equal((await s.current()).narrative,'changed concurrently');await unchanged(s,(await s.current()).version);
});
test('revocation during verification is rechecked before writes',async()=>{
  const s=await setup({onVerify:async({memory,context})=>memory.runAtomic(async c=>{const u=await c.users.findById(context.actorId);return c.users.setEnabled(u.id,u.version,false);})});
  await s.associate();const v=(await s.current()).version;
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('ACCESS_DENIED'));await unchanged(s,v);
});
test('expired verification at final transaction is rejected',async()=>{
  const s=await setup({onVerify:async({h})=>h.advance(31000)});await s.associate();const v=(await s.current()).version;
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('INCOMPATIBLE_STATE'));await unchanged(s,v);
});
test('HTTP rejects forged verification, bad metadata, invalid JWT and hides internal actors',async()=>{
  const s=await setup();const body={...await s.command('http:1'),evidence:s.input()};delete body.key;
  assert.equal((await s.http('associateEvidence',{...body,evidence:{...body.evidence,status:'verified'}})).status,400);
  assert.equal((await s.http('associateEvidence',body,{headers:{}})).status,401);
  assert.equal((await s.http('associateEvidence',body,{headers:{Authorization:'Bearer invalid'}})).status,401);
  const declared=await s.http('associateEvidence',body);assert.equal(declared.status,201);
  assert.equal(declared.jsonBody.data.result.evidence.status,'declared');
  assert.doesNotMatch(JSON.stringify(declared),/declaredBy/);
  const sent=await s.http('submitReport',{...await s.command('http:send'),key:undefined});
  // key is a header, never a JSON field; even undefined properties disappear on JSON serialization.
  assert.equal(sent.status,200);assert.doesNotMatch(JSON.stringify(sent),/submittedBy|authorizedForUserId|createdBy|updatedBy/);
});
for(const [field,value]of [['storageReference','https://private.invalid/file?token=secret'],['name','../file.pdf'],
  ['mediaType','application/pdf;secret'],['sizeBytes',-1],['sizeBytes',1.2],['sizeBytes',null],['name','bad\u0000name'],['storageReference','']]){
  test('declared metadata rejects '+field+': '+String(value),async()=>{
    const s=await setup();assert.throws(()=>validateEvidenceInput({...s.input(),[field]:value}),code('INVALID_VALUE'));
  });
}
test('SQL adapters reject new events/operations/outcomes before any query without schema changes',async()=>{
  let queries=0;const session={execute:async()=>{queries++;throw new Error('must not query');}};
  const audit=new SqlAuditRepository(session),idem=new SqlIdempotencyRepository(session);
  await assert.rejects(audit.append({change:{action:'poc:report-submitted'}}),code('SQL_CODEC_INVALID'));
  await assert.rejects(idem.findByScope({actorId:'user',operation:'poc:submit-report',key:'key'}),code('SQL_CODEC_INVALID'));
  await assert.rejects(idem.complete('id','opaque',{progress:{kind:'submission'}},'2000-01-01T00:00:00.000Z'),code('SQL_CODEC_INVALID'));
  assert.equal(queries,0);
});

test('declaration stale version and duplicate ID cannot leave report or reservation changes',async()=>{
  const s=await setup();await s.associate();const v=(await s.current()).version;
  await assert.rejects(s.service.associate(s.identity,s.report.id,{key:'stale:assoc',period:s.report.period,
    expectedVersion:s.report.version,evidence:s.input('stale')}),code('VERSION_CONFLICT'));
  await assert.rejects(s.associate(s.input(),'duplicate:assoc'),code('DUPLICATE'));
  assert.equal((await s.current()).version,v);assert.equal((await s.service.list(s.identity,s.report.id)).length,1);
  await s.memory.runAtomic(async c=>assert.equal(await c.idempotency.findByScope({actorId:s.f.alpha,operation:'poc:associate-evidence',key:'duplicate:assoc'}),null));
});
test('verification errors and unexpected provider fields are sanitized and cannot become accepted evidence',async()=>{
  for(const options of [{onVerify:async()=>{throw new Error(secret);}},{proof:{accessToken:secret}}]){
    const s=await setup(options);await s.associate();const v=(await s.current()).version;
    const r=await s.http('submitReport',await s.command());assert.ok([409,500].includes(r.status));
    assert.doesNotMatch(JSON.stringify(r),/private-driver|password|accessToken|stack/);await unchanged(s,v);
  }
});
test('policy changes during verification prevent commit',async()=>{
  const plan={};const s=await setup({plan,onVerify:async()=>{plan.policyVersion='changed-v2';}});
  await s.associate();const v=(await s.current()).version;
  await assert.rejects(s.service.submit(s.identity,s.report.id,await s.command()),code('INCOMPATIBLE_STATE'));await unchanged(s,v);
});
test('HTTP listing and submission reads are authorized and keep declared/file-valid states distinct',async()=>{
  const s=await setup();await s.associate();
  const listed=await s.http('listEvidence');assert.equal(listed.status,200);assert.equal(listed.jsonBody.data[0].status,'declared');
  assert.equal((await s.http('getSubmission')).jsonBody.data,null);
  await s.service.submit(s.identity,s.report.id,await s.command());
  const sent=await s.http('getSubmission');assert.equal(sent.status,200);assert.equal(sent.jsonBody.data.state,'Enviado');
  assert.equal(sent.jsonBody.data.evidence[0].status,'valid-for-submission');
  assert.equal((await s.http('listEvidence')).jsonBody.data[0].status,'declared');
  assert.doesNotMatch(JSON.stringify(sent),/submittedBy|authorizedForUserId|createdBy|updatedBy/);
  const foreign=await signedToken({oid:s.f.seed.users[1].directoryObjectId});
  assert.equal((await s.http('listEvidence',undefined,{headers:{Authorization:'Bearer '+foreign}})).status,404);
  assert.equal((await s.http('getSubmission',undefined,{params:{reportId:'missing'}})).status,404);
});
test('missing provider remains blocked by default composition even with an otherwise authorized user',async()=>{
  const s=await setup();await s.associate();
  const handlers=createApplicationHandlers(s.h.validator,s.work,
    new FichaAuthorizationService(configuration.tenantId,s.h.clock,{isApplicable:()=>true}),s.h.clock,s.tools);
  const r=await handlers.submitReport(new HttpRequest({method:'POST',url:'http://127.0.0.1/api/poc/reportes/'+s.report.id+'/enviar',
    params:{reportId:s.report.id},headers:{Authorization:'Bearer '+s.jwt,'Content-Type':'application/json','Idempotency-Key':'send:1'},
    body:{string:JSON.stringify({period:s.report.period,expectedVersion:(await s.current()).version})}}));
  assert.equal(r.status,409);assert.equal(s.verifyCalls(),0);
});
