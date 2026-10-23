// Test-only joint exercise. No native import, HTTP, credentials or connection here.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { SqlUnitOfWork } from '../../.local-build/infrastructure/sql/unitOfWork.js';
import { SqlSessionRunner } from '../../.local-build/infrastructure/sql/session.js';
import { IncompatibleStateError } from '../../.local-build/domain/errors.js';
import { identifier, guid, instant, unicodeText, capability } from '../../.local-build/infrastructure/sql/codecs.js';

export const tables = Object.freeze(['InstitutionalUsers','Dependencies','Fichas','AccessAssignments',
  'Activities','Reports','AuditEvents','IdempotencyRecords']);
export const stateSql = `/* PAI_L8D5_STATE */ SELECT @@SPID AS sessionId,
 (SELECT CONVERT(varchar(23),login_time,126) FROM sys.dm_exec_sessions WHERE session_id=@@SPID) AS loginTime,
 CASE WHEN ORIGINAL_LOGIN()=CONVERT(sysname,SERVERPROPERTY('MachineName'))+N'\\PAIPOC_Test' THEN 1 ELSE 0 END AS expectedIdentity,
 IS_SRVROLEMEMBER('sysadmin') AS sysadmin, IS_MEMBER('db_owner') AS dbOwner,
 HAS_PERMS_BY_NAME(NULL,NULL,'CONTROL SERVER') AS controlServer,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS controlDatabase,
 @@TRANCOUNT AS transactionCount, XACT_STATE() AS transactionState,
 (SELECT transaction_isolation_level FROM sys.dm_exec_sessions WHERE session_id=@@SPID) AS isolation,
 DB_NAME() AS databaseName, CONNECTIONPROPERTY('net_transport') AS transport;`;

export function fixture() {
  const prefix = 'l8d5-' + randomUUID().replaceAll('-','');
  return Object.freeze({ user: prefix+'-user', dependency: prefix+'-dep', ficha: prefix+'-f', ficha2: prefix+'-g',
    firstActivity: prefix+'-z', secondActivity: prefix+'-a', firstAssignment: prefix+'-za', secondAssignment: prefix+'-aa',
    report: prefix+'-r', audit: prefix+'-audit', audit2: prefix+'-audit2', idem: prefix+'-idem',
    tenant: randomUUID(), object: randomUUID(), now: '2026-01-02T03:04:05.123Z', later: '2026-01-02T03:04:06.456Z',
    text: 'PoC sintética: á 😀 漢字', period: '2026-Á😀', quantity: '9007199254740993.00000000000000000000100',
    quantity2: '-0.0000000000000000000000000000100' });
}
function id(kind, value) { return { type:'varchar',length:64,value:identifier(kind).encode(value) }; }
function nv(value) { return { type:'nvarchar',length:'max',value:unicodeText.encode(value) }; }
function date(value) { return { type:'datetime2',scale:3,value:value === null ? null : instant.encode(value) }; }
function insert(table, fields) {
  assert.ok(tables.includes(table));
  const pairs=Object.entries(fields);
  return { text:`INSERT INTO pai.${table} (${pairs.map(([name])=>name).join(', ')}) OUTPUT INSERTED.Id VALUES (${pairs.map((_,n)=>'@fixture_'+n).join(', ')});`,
    parameters:pairs.map(([,parameter],n)=>({name:'fixture_'+n,...parameter})) };
}
export function fixtureStatements(f) {
  return [
    insert('InstitutionalUsers',{Id:id('user',f.user),TenantId:{type:'uniqueidentifier',value:guid('tenant').encode(f.tenant)},
      DirectoryObjectId:{type:'uniqueidentifier',value:guid('directory-object').encode(f.object)},Alias:nv(f.text),Enabled:{type:'bit',value:true}}),
    insert('Dependencies',{Id:id('dependency',f.dependency),Label:nv(f.text)}),
    ...[f.ficha,f.ficha2].map(value=>insert('Fichas',{Id:id('ficha',value),DependencyId:id('dependency',f.dependency),CycleLabel:nv(f.text)})),
    ...[f.firstActivity,f.secondActivity].map(value=>insert('Activities',{Id:id('activity',value),FichaId:id('ficha',f.ficha),Description:nv(f.text)})),
    ...[f.firstAssignment,f.secondAssignment].map((value,n)=>insert('AccessAssignments',{
      Id:id('assignment',value),UserId:id('user',f.user),FichaId:id('ficha',f.ficha),
      Capability:{type:'varchar',length:40,value:capability.encode(n ? 'poc:edit-report':'poc:read')},
      Enabled:{type:'bit',value:n===1},ValidFrom:date(n ? '2027-01-01T00:00:00.000Z':'2025-01-01T00:00:00.000Z'),
      ValidUntil:date(n ? null:'2025-12-31T00:00:00.000Z') })),
  ];
}

// Test-only interception before LocalOdbcTransport sanitizes the native error.
// Never retains the exception, messages, parameter values or connection identity.
export function diagnosticFixtureDriver(driver, record) {
  const columns=['Id','TenantId','DirectoryObjectId','Alias','Enabled'];
  const expected=fixtureStatements(fixture())[0].text;
  class DiagnosticRequest extends driver.Request {
    async query(text) {
      try { return await super.query(text); }
      catch(error) {
        if(text===expected) {
          const codes=new Set(['EREQUEST','ETIMEOUT','ETIMEDOUT','ELOGIN','ESOCKET','ECANCEL','EARGS','EINJECT']);
          const states=new Set(['23000','42000','22001','22003','22007','22018','HY000','HYT00','HYT01','08001','08003']);
          const nodes=[error,error?.originalError,error?.originalError?.info,
            ...(Array.isArray(error?.precedingErrors)?error.precedingErrors.slice(0,4):[])];
          const numbers=[...new Set(nodes.flatMap(e=>[e?.number,e?.native,e?.nativeError])
            .filter(n=>Number.isInteger(n)&&n>=0&&n<=2147483647))];
          const evidence=Object.freeze({operation:'InstitutionalUsers.fixtureInsert',
            errorClass:['RequestError','ConnectionError','TypeError','Error'].includes(error?.name)?error.name:'OTHER',
            code:nodes.map(e=>e?.code).find(c=>codes.has(c))??null,
            sqlState:nodes.flatMap(e=>[e?.sqlstate,e?.sqlState,e?.state]).find(s=>states.has(s))??null,
            sqlNumbers:numbers,column:null,constraint:null,
            parameters:columns.map((column,i)=>({name:'fixture_'+i,column,
              type:['varchar(64)','uniqueidentifier','uniqueidentifier','nvarchar(max)','bit'][i]}))});
          try { record(evidence); } catch { /* diagnostics cannot replace the failure */ }
        }
        throw error;
      }
    }
  }
  return {...driver,Request:DiagnosticRequest};
}

// Defense in depth: even a broken test callback cannot issue a native commit.
export function rollbackOnlyTransport(base, ledger) {
  return { async connect() {
    ledger.connections++;
    assert.equal(ledger.connections,1);
    const connection=await base.connect();
    return {
      async begin(level) {
        ledger.begins++; assert.equal(level,'SERIALIZABLE'); assert.equal(ledger.begins,1);
        const tx=await connection.begin(level);
        return {
          async execute(statement) {
            ledger.queries++; ledger.pending++;
            try { return await tx.execute(statement); } finally { ledger.pending--; }
          },
          async commit() { ledger.commitAttempts++; throw new IncompatibleStateError(); },
          async rollback() { ledger.rollbackAttempts++; await tx.rollback(); ledger.rollbackSucceeded=true; },
        };
      },
      async close() { assert.equal(ledger.pending,0); await connection.close(); ledger.closeSucceeded=true; },
    };
  } };
}
export function newLedger() { return {connections:0,begins:0,queries:0,pending:0,commitAttempts:0,rollbackAttempts:0,
  rollbackSucceeded:false,closeSucceeded:false,assertionsComplete:false,closedContextRejected:false,methods:[]}; }
// Fixed diagnostic fields only. No identity names, raw login_time, SQL or driver errors.
function publicStateValue(field,value) {
  if(value===undefined)return '[missing]';
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:'[non-finite]';
  if(field==='databaseName')return value==='pai_poc_dev'?value:'[unexpected database]';
  if(field==='transport'&&['Shared memory','TCP','Named pipe'].includes(value))return value;
  if(field==='loginTime.type'&&['string','undefined','object','number','boolean'].includes(value))return value;
  return '[redacted]';
}
export function checkState(s,onDiagnostic=()=>{}) {
  const conditions=[
    ['expectedIdentity',1,()=>s.expectedIdentity],['sysadmin',0,()=>s.sysadmin],['dbOwner',0,()=>s.dbOwner],
    ['controlServer',0,()=>s.controlServer],['controlDatabase',0,()=>s.controlDatabase],
    ['databaseName','pai_poc_dev',()=>s.databaseName],['transport','Shared memory',()=>s.transport],
    ['transactionCount',1,()=>s.transactionCount],['transactionState',1,()=>s.transactionState],['isolation',4,()=>s.isolation],
    ['sessionId.valid',true,()=>Number.isInteger(s.sessionId)&&s.sessionId>0],['loginTime.type','string',()=>typeof s.loginTime],
  ];
  for(const [field,expected,read] of conditions) {
    let actual;
    try { actual=read();assert.equal(actual,expected); }
    catch(error) {
      const connectionTag=Number.isInteger(s?.sessionId)&&typeof s?.loginTime==='string'
        ?createHash('sha256').update(String(s.sessionId)+'|'+s.loginTime).digest('hex').slice(0,12):null;
      const evidence=Object.freeze({stage:'stateBefore',operation:'checkState',field,
        expected:publicStateValue(field,expected),actual:publicStateValue(field,actual),
        actualType:actual===null?'null':typeof actual,
        originalErrorType:error instanceof assert.AssertionError?'AssertionError':'TypeError',
        code:error instanceof assert.AssertionError?'ERR_ASSERTION':null,sqlErrorNumber:null,connectionTag});
      try { onDiagnostic(evidence); } catch { /* diagnostic never replaces the assertion */ }
      throw error;
    }
  }
}
export async function exerciseRepositories(tx,f,ledger) {
  const call=async(name,fn)=>{ledger.stage=name;const value=await fn(); if(!ledger.methods.includes(name))ledger.methods.push(name); return value;};
  const user=await call('users.findById',()=>tx.users.findById(f.user));
  assert.equal(user.alias,f.text); assert.equal(user.enabled,true); assert.match(user.version,/^rv1:[0-9a-f]{16}$/);
  assert.deepEqual(await call('users.findByIdentity',()=>tx.users.findByIdentity(f.tenant,f.object)),user);
  const disabled=await call('users.setEnabled',()=>tx.users.setEnabled(user.id,user.version,false));
  assert.equal(disabled.enabled,false); assert.notEqual(disabled.version,user.version);
  const ficha=await call('fichas.findById',()=>tx.fichas.findById(f.ficha));
  assert.equal(ficha.dependencyId,f.dependency); assert.equal(ficha.cycleLabel,f.text);
  assert.deepEqual((await call('fichas.findByIds',()=>tx.fichas.findByIds([f.ficha2,f.ficha,f.ficha2]))).map(x=>x.id),[f.ficha2,f.ficha]);
  assert.equal((await call('activities.findById',()=>tx.activities.findById(f.firstActivity))).description,f.text);
  assert.deepEqual((await call('activities.listByFicha',()=>tx.activities.listByFicha(f.ficha))).map(x=>x.id),[f.firstActivity,f.secondActivity]);
  const assignment=await call('assignments.findById',()=>tx.assignments.findById(f.firstAssignment));
  assert.equal(assignment.enabled,false); assert.equal(assignment.validUntil,'2025-12-31T00:00:00.000Z');
  assert.deepEqual((await call('assignments.listByUserAndFicha',()=>tx.assignments.listByUserAndFicha(f.user,f.ficha))).map(x=>x.id),[f.firstAssignment,f.secondAssignment]);
  const enabled=await call('assignments.setEnabled',()=>tx.assignments.setEnabled(assignment.id,assignment.version,true));
  assert.equal(enabled.enabled,true); assert.notEqual(enabled.version,assignment.version);
  const scope={actorId:f.user,operation:'poc:create-report',key:'request:'+f.idem};
  const reserved=await call('idempotency.reserve',()=>tx.idempotency.reserve({id:f.idem,scope,requestFingerprint:'a'.repeat(64),createdAt:f.now}));
  assert.equal(reserved.state,'poc:reserved');
  const created=await call('reports.create',()=>tx.reports.create({id:f.report,activityId:f.firstActivity,period:f.period,quantity:f.quantity,
    narrative:f.text,state:'poc-draft',createdBy:f.user,createdAt:f.now,updatedBy:f.user,updatedAt:f.now}));
  assert.equal(created.quantity,f.quantity); assert.equal(created.createdAt,f.now);
  assert.deepEqual(await call('reports.findById',()=>tx.reports.findById(created.id)),created);
  assert.deepEqual(await call('reports.findByActivityAndPeriod',()=>tx.reports.findByActivityAndPeriod(f.firstActivity,f.period)),created);
  const audit={id:f.audit,actorId:f.user,occurredAt:f.now,correlationId:'corr:'+f.audit,change:{action:'poc:report-created',before:null,after:created}};
  await call('audit.append',()=>tx.audit.append(audit));
  assert.deepEqual(await call('audit.findById',()=>tx.audit.findById(audit.id)),audit);
  assert.deepEqual(Object.keys(tx.audit).sort(),['append','findById']);
  const completed=await call('idempotency.complete',()=>tx.idempotency.complete(reserved.id,reserved.version,{report:created,auditEventId:audit.id},f.later));
  assert.equal(completed.state,'poc:completed'); assert.equal(completed.completedAt,f.later); assert.notEqual(completed.version,reserved.version);
  const updated=await call('reports.update',()=>tx.reports.update(created.id,created.version,{quantity:f.quantity2,narrative:f.text+' actualizado',state:'poc-draft',updatedBy:f.user,updatedAt:f.later}));
  assert.equal(updated.quantity,f.quantity2); assert.equal(updated.updatedAt,f.later); assert.notEqual(updated.version,created.version);
  for(const field of ['id','activityId','period','createdBy','createdAt'])assert.equal(updated[field],created[field]);
  await tx.audit.append({id:f.audit2,actorId:f.user,occurredAt:f.later,correlationId:'corr:'+f.audit2,
    change:{action:'poc:report-updated',before:created,after:updated}});
  const historical=await call('idempotency.findByScope',()=>tx.idempotency.findByScope(scope));
  assert.deepEqual(historical,completed); assert.deepEqual(historical.outcome.report,created);
  assert.deepEqual((await tx.audit.findById(f.audit)).change.after,created);
  assert.deepEqual((await tx.audit.findById(f.audit2)).change.after,updated);
  ledger.historicalResultPreserved=true;
  // Deliberately last: any repository error poisons this scope.
  await assert.rejects(tx.reports.update(created.id,created.version,{quantity:null,narrative:'stale',state:'poc-draft',updatedBy:f.user,updatedAt:f.later}),e=>e.code==='VERSION_CONFLICT');
  ledger.staleVersionRejected=true;
}
export async function runJoint(base,{capture=async()=>{},f=fixture(),exercise=exerciseRepositories,ledger=newLedger()}={}) {
  let retained,firstSession;
  const transport=rollbackOnlyTransport(base,ledger);
  class FixtureRunner extends SqlSessionRunner {
    run(completion,work) {
      return super.run(completion,async session=>{
        ledger.stage='stateBefore';
        const [state]=await session.execute({text:stateSql,parameters:[]}); checkState(state);
        firstSession=state.sessionId;
        ledger.stage='captureIdentity';
        await capture({sessionId:state.sessionId,loginTime:state.loginTime});
        for(const statement of fixtureStatements(f)){ ledger.stage='fixtureInsert'; await session.execute(statement); }
        let value,primary;
        try { value=await work(session); } catch(error){primary=error;}
        try {
          const [end]=await session.execute({text:stateSql,parameters:[]}); checkState(end);
          assert.equal(end.sessionId,firstSession); assert.equal(end.loginTime,state.loginTime);
          ledger.sameSessionAtEnd=true;
        } catch(error){primary??=error;}
        if(primary)throw primary;
        return value;
      });
    }
  }
  const uow=new SqlUnitOfWork(new FixtureRunner(transport));
  let primary;
  try {
    await uow.runAtomic(async tx=>{
      retained=tx;
      await exercise(tx,f,ledger);
      ledger.assertionsComplete=true;
      throw new IncompatibleStateError(); // Intentional terminal failure, NEVER normal completion.
    });
  } catch(error){primary=error;}
  if(retained){
    const count=ledger.queries;
    await assert.rejects(retained.activities.findById(f.firstActivity),e=>e.code==='INCOMPATIBLE_STATE');
    assert.equal(ledger.queries,count); ledger.closedContextRejected=true;
  }
  assert.equal(ledger.commitAttempts,0); assert.equal(ledger.pending,0);
  assert.equal(ledger.rollbackAttempts,1); assert.equal(ledger.rollbackSucceeded,true); assert.equal(ledger.closeSucceeded,true);
  if(!ledger.assertionsComplete || primary?.code!=='INCOMPATIBLE_STATE')throw primary ?? new Error('JOINT_ASSERTIONS_FAILED');
  assert.equal(ledger.sameSessionAtEnd,true); assert.equal(ledger.methods.length,19);
  assert.ok(firstSession); // Same runner session and native transaction carry every call.
  return Object.freeze({...ledger,methods:Object.freeze([...ledger.methods])});
}
