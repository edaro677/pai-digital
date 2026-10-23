import test from 'node:test';
import assert from 'node:assert/strict';
import { runJoint, fixture, tables, stateSql, newLedger, rollbackOnlyTransport } from './helpers/sql-joint-work.mjs';
import { SqlUnitOfWork } from '../.local-build/infrastructure/sql/unitOfWork.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';
import { diagnosticFixtureDriver, fixtureStatements } from './helpers/sql-joint-work.mjs';

test('writer presentation: success clears residual category; failure preserves sanitized classification',async()=>{
  const {writerCategory}=await import('./integration/sql-unit-of-work.mjs');
  assert.equal(writerCategory('OK','L8D5_CHECK_FAILED'),null);
  assert.equal(writerCategory('OK','SQL_QUERY_FAILED'),null);
  assert.equal(writerCategory('FAILED','SQL_QUERY_FAILED'),'SQL_QUERY_FAILED');
  assert.equal(writerCategory('FAILED','L8D5_CHECK_FAILED'),'L8D5_CHECK_FAILED');
  assert.equal(writerCategory('FAILED','private driver message'),'L8D5_CHECK_FAILED');
});

test('observer diagnostic: separates native query/connection failure and redacts untrusted fields',async()=>{
  const {observerDiagnostic}=await import('./integration/sql-unit-of-work.mjs');
  const e=Object.assign(new Error('EMPRESA\\usuario C:\\Privado password=synthetic'),
    {name:'RequestError',code:'EREQUEST',originalError:{info:{number:468,sqlState:'42000'}}});
  const d=observerDiagnostic('INITIAL_CATALOG_QUERY',e);
  assert.equal(d.precondition,'INITIAL_CATALOG_QUERY');assert.equal(d.code,'EREQUEST');
  assert.deepEqual(d.sqlNumbers,[468]);assert.equal(d.sqlState,'42000');
  assert.equal(observerDiagnostic('CONNECT',Object.assign(new Error(),{code:'ETIMEOUT'})).code,'ETIMEOUT');
  assert.doesNotMatch(JSON.stringify(d),/usuario|Privado|password|stack|message/);
  assert.equal(observerDiagnostic('private value',e).precondition,'UNKNOWN');
});

test('observer diagnostic: reports safe assertion values without weakening the assertion',async()=>{
  const {observerDiagnostic}=await import('./integration/sql-unit-of-work.mjs');
  let error;try{assert.equal(0,1);}catch(e){error=e;}
  const d=observerDiagnostic('OBSERVATION_RIGHTS_VALIDATION',error);
  assert.equal(d.expected,1);assert.equal(d.actual,0);assert.equal(d.code,'ERR_ASSERTION');
  try{assert.equal('private identity','ONLINE');}catch(e){error=e;}
  const redacted=observerDiagnostic('INITIAL_SNAPSHOT_VALIDATION',error);
  assert.equal(redacted.expected,'ONLINE');assert.equal(redacted.actual,'[redacted]');
});

test('fixtures: nonreserved names exactly match placeholders, preserving types and synthetic values',()=>{
  const f=fixture(),statements=fixtureStatements(f);
  const expected=[
    [['varchar',f.user],['uniqueidentifier',f.tenant],['uniqueidentifier',f.object],['nvarchar',f.text],['bit',true]],
    [['varchar',f.dependency],['nvarchar',f.text]],
    ...[f.ficha,f.ficha2].map(v=>[['varchar',v],['varchar',f.dependency],['nvarchar',f.text]]),
    ...[f.firstActivity,f.secondActivity].map(v=>[['varchar',v],['varchar',f.ficha],['nvarchar',f.text]]),
    ...[f.firstAssignment,f.secondAssignment].map((v,n)=>[['varchar',v],['varchar',f.user],['varchar',f.ficha],
      ['varchar',n?'poc:edit-report':'poc:read'],['bit',n===1],
      ['datetime2',new Date(n?'2027-01-01T00:00:00.000Z':'2025-01-01T00:00:00.000Z')],
      ['datetime2',n?null:new Date('2025-12-31T00:00:00.000Z')]])
  ];
  assert.equal(statements.length,8);
  for(const [i,s] of statements.entries()){
    assert.doesNotMatch(s.text,/@p\d+\b/i);
    assert.deepEqual([...s.text.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)].map(m=>m[1]),s.parameters.map(p=>p.name));
    assert.deepEqual(s.parameters.map(p=>[p.type,p.value]),expected[i]);
    for(const [n,p] of s.parameters.entries()){
      assert.equal(p.name,'fixture_'+n);assert.doesNotMatch(p.name,/^p\d+$/i);
      if(p.type==='nvarchar')assert.equal(p.length,'max');
      if(p.type==='varchar')assert.equal(p.length,i>=6&&n===3?40:64);
      if(p.type==='datetime2')assert.equal(p.scale,3);
    }
  }
});

test('first fixture: typed values satisfy the declared InstitutionalUsers constraints without I/O',async()=>{
  const {prepareMssqlOdbcParameters}=await import('../.local-build/infrastructure/sql/parameters.js');
  const s=fixtureStatements(fixture())[0],p=prepareMssqlOdbcParameters(s.parameters);
  assert.match(p[0].value,/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
  for(const i of [1,2]){assert.match(p[i].value,/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);assert.notEqual(p[i].value,'00000000-0000-0000-0000-000000000000');}
  assert.equal(p[3].type,'nvarchar');assert.equal(p[3].length,'max');assert.ok(p[3].value.includes('😀'));
  assert.equal(p[4].type,'bit');assert.equal(p[4].value,true);
  assert.doesNotMatch(s.text,/\bRV\b/);
});

test('first fixture diagnostic: safe native fields only, original failure preserved',async()=>{
  const original=Object.assign(new Error('EMPRESA\\usuario.prueba secret C:\\Privado'),{
    name:'RequestError',code:'EREQUEST',number:547,originalError:{info:{number:547,sqlState:'23000'},message:'password=synthetic'}});
  const evidence=[];
  class Request {async query(){throw original;}}
  const d=diagnosticFixtureDriver({Request},e=>evidence.push(e));
  await assert.rejects(new d.Request().query(fixtureStatements(fixture())[0].text),e=>e===original);
  assert.equal(evidence.length,1);assert.deepEqual(evidence[0].sqlNumbers,[547]);assert.equal(evidence[0].sqlState,'23000');
  assert.equal(evidence[0].code,'EREQUEST');assert.equal(evidence[0].column,null);
  assert.doesNotMatch(JSON.stringify(evidence),/usuario|Privado|password|stack|message/);
});

test('first fixture diagnostic: no interception of other SQL or successful results',async()=>{
  const evidence=[];const original=new Error('private');
  class Failed {async query(){throw original;}}
  const d=diagnosticFixtureDriver({Request:Failed},e=>evidence.push(e));
  await assert.rejects(new d.Request().query('SELECT 1'),e=>e===original);assert.equal(evidence.length,0);
  const result={recordset:[{Id:'synthetic'}]};class Passed {async query(){return result;}}
  const ok=diagnosticFixtureDriver({Request:Passed},e=>evidence.push(e));
  assert.equal(await new ok.Request().query(fixtureStatements(fixture())[0].text),result);assert.equal(evidence.length,0);
});

test('first fixture diagnostic: sink failures never replace the native error',async()=>{
  const original=new TypeError('synthetic');class Request {async query(){throw original;}}
  const d=diagnosticFixtureDriver({Request},()=>{throw new Error('observer');});
  await assert.rejects(new d.Request().query(fixtureStatements(fixture())[0].text),e=>e===original);
});

// Transactional double only. This does not demonstrate SQL Server atomicity.
function fake(options={}) {
  const committed=Object.fromEntries(tables.map(t=>[t,[]]));
  let draft,version=1;
  const calls=[],owners=new Set();
  const rv=()=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(version++));return b;};
  const tx={
    async execute(s){
      calls.push(s);owners.add(tx);
      if(s.text===stateSql)return [{sessionId:17,loginTime:'2026-01-02T00:00:00.000',expectedIdentity:1,sysadmin:0,dbOwner:0,
        controlServer:0,controlDatabase:0,databaseName:'pai_poc_dev',transport:'Shared memory',transactionCount:1,transactionState:1,isolation:4}];
      const table=s.text.match(/(?:FROM|INTO|UPDATE) pai\.(\w+)/)?.[1]; assert.ok(tables.includes(table));
      if(options.failTable===table && s.text.startsWith('INSERT'))throw new Error('SYNTHETIC_FAILURE');
      const p=Object.fromEntries(s.parameters.map(x=>[x.name,x.value]));
      if(s.text.startsWith('SELECT'))return structuredClone(draft[table].filter(r=>{
        if(p.id!==undefined)return r.Id===p.id;
        if(Object.hasOwn(p,'id0'))return s.parameters.some(x=>r.Id===x.value);
        if(table==='InstitutionalUsers')return r.TenantId===p.tenantId&&r.DirectoryObjectId===p.directoryObjectId;
        if(table==='Activities')return r.FichaId===p.fichaId;
        if(table==='AccessAssignments')return r.UserId===p.userId&&r.FichaId===p.fichaId;
        if(table==='Reports')return r.ActivityId===p.activityId&&r.PeriodKey===p.period;
        if(table==='IdempotencyRecords')return r.ActorId===p.actorId&&r.Operation===p.operation&&r.IdempotencyKey===p.key;
        return false;
      }).sort((a,b)=> s.text.includes('ORDER BY InsertionOrder') ? a.InsertionOrder-b.InsertionOrder : 0));
      if(s.text.startsWith('INSERT')){
        const columns=s.text.match(/INSERT INTO pai\.\w+ \(([^)]+)\)/)[1].split(',').map(x=>x.trim());
        const values=s.text.match(/VALUES \(([^)]+)\)/)[1].split(',').map(x=>x.trim());
        const row=Object.fromEntries(columns.map((c,n)=>[c,values[n].startsWith('@')?p[values[n].slice(1)]:values[n].slice(1,-1)]));
        if(table!=='AuditEvents')row.RV=rv();
        if(['Activities','AccessAssignments'].includes(table))row.InsertionOrder=draft[table].length+1;
        if(table==='IdempotencyRecords')Object.assign(row,{CompletedAt:null,OutcomeReportId:null,OutcomeAuditEventId:null,OutcomeReportJson:null});
        draft[table].push(row);return [structuredClone(row)];
      }
      assert.ok(s.text.startsWith('UPDATE'));
      const row=draft[table].find(r=>r.Id===p.id);
      if(!row || !Buffer.from(row.RV).equals(Buffer.from(p.expectedVersion)))return [];
      if(table==='InstitutionalUsers'||table==='AccessAssignments')row.Enabled=p.enabled;
      if(table==='Reports')Object.assign(row,{QuantityText:p.quantity,Narrative:p.narrative,State:p.state,UpdatedBy:p.updatedBy,UpdatedAt:p.updatedAt});
      if(table==='IdempotencyRecords')Object.assign(row,{State:'poc:completed',CompletedAt:p.completedAt,OutcomeReportId:p.reportId,OutcomeAuditEventId:p.auditId,OutcomeReportJson:p.reportJson});
      row.RV=rv(); return [structuredClone(row)];
    },
    async commit(){throw new Error('NATIVE_COMMIT_MUST_NEVER_RUN');},
    async rollback(){if(options.failRollback)throw new Error('SYNTHETIC_ROLLBACK');draft=undefined;},
  };
  return {committed,calls,owners,transport:{async connect(){return {
    async begin(level){assert.equal(level,'SERIALIZABLE');draft=structuredClone(committed);return tx;},
    async close(){if(options.failClose)throw new Error('SYNTHETIC_CLOSE');},
  };}}};
}

test('L8-D5: same joint exercise covers 19 methods, exact data and rollback of all eight tables',async()=>{
  const f=fake(); let captures=0;
  const result=await runJoint(f.transport,{capture:async identity=>{assert.equal(identity.sessionId,17);captures++;}});
  assert.equal(captures,1); assert.equal(result.assertionsComplete,true); assert.equal(result.historicalResultPreserved,true);
  assert.equal(result.staleVersionRejected,true); assert.equal(result.commitAttempts,0);assert.equal(result.rollbackAttempts,1);
  assert.equal(result.closedContextRejected,true);assert.equal(result.methods.length,19);assert.equal(f.owners.size,1);
  for(const rows of Object.values(f.committed))assert.deepEqual(rows,[]);
  assert.ok(f.calls.some(s=>s.text.startsWith('INSERT INTO pai.Reports')));
  assert.ok(f.calls.some(s=>s.text.startsWith('INSERT INTO pai.AuditEvents')));
  assert.ok(f.calls.some(s=>s.text.startsWith('UPDATE pai.IdempotencyRecords')));
});
for(const table of ['AuditEvents','IdempotencyRecords'])test(`L8-D5: ${table} failure rolls back previous writes and closes`,async()=>{
  const f=fake({failTable:table}),ledger=newLedger();
  await assert.rejects(runJoint(f.transport,{ledger}));
  assert.equal(ledger.rollbackSucceeded,true);assert.equal(ledger.closeSucceeded,true);assert.equal(ledger.commitAttempts,0);
  for(const rows of Object.values(f.committed))assert.deepEqual(rows,[]);
});
for(const option of ['failRollback','failClose'])test(`L8-D5: cleanup failure ${option} stays blocking despite terminal sentinel`,async()=>{
  const f=fake({[option]:true});await assert.rejects(runJoint(f.transport));
});
test('L8-D5: observer refusal prevents fixtures, with rollback and close',async()=>{
  const f=fake(),ledger=newLedger();
  await assert.rejects(runJoint(f.transport,{ledger,capture:async()=>{throw new Error('OBSERVER_FAILED');}}));
  assert.equal(f.calls.length,1);assert.equal(ledger.rollbackSucceeded,true);assert.equal(ledger.closeSucceeded,true);
});
test('L8-D5: commit guard prevents a native commit even for an accidentally successful callback',async()=>{
  const f=fake(),ledger=newLedger();
  const uow=new SqlUnitOfWork(new SqlSessionRunner(rollbackOnlyTransport(f.transport,ledger)));
  await assert.rejects(uow.runAtomic(async()=>true));
  assert.equal(ledger.commitAttempts,1);assert.equal(ledger.rollbackSucceeded,true);assert.equal(ledger.closeSucceeded,true);
});
test('L8-D5: fixtures are synthetic, typed, exclusive and do not require DDL',()=>{
  const a=fixture(),b=fixture();assert.notEqual(a.user,b.user);assert.ok(a.user.length<=64);
  assert.match(a.quantity,/^\d+\.\d+$/);assert.ok(a.text.includes('😀'));
});

test('L8-D5: final residual policy accepts only absence or inactive sleeping, never activity',async()=>{
  const {classifyResidual}=await import('./integration/sql-unit-of-work.mjs');
  assert.equal(classifyResidual([]).classification,'A');
  const inactive={status:'sleeping',transactions:0,requests:0,userTransactions:0,blocks:0,waits:0};
  assert.equal(classifyResidual([inactive]).warning,'CONNECTION_STILL_VISIBLE');
  for(const field of ['transactions','requests','userTransactions','blocks','waits'])
    assert.throws(()=>classifyResidual([{...inactive,[field]:1}]));
  assert.throws(()=>classifyResidual([{...inactive,status:'running'}]));
});
test('L8-D5: catalog read is extracted from approved verifier, without executing its transaction',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {catalogSql}=await import('./integration/sql-unit-of-work.mjs');
  const text=await readFile(new URL('../migrations/verifiers/0001_initial/r1/verify.sql',import.meta.url),'utf8');
  const sql=catalogSql(text);
  assert.match(sql,/HASHBYTES\('SHA2_256',@Catalog\)/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|COMMIT|ROLLBACK|EXEC)\b/i);
  for(const table of tables)assert.ok(sql.includes(`COUNT_BIG(*) AS total_registros FROM pai.${table}`));
});
test('L8-D5: snapshots reject nonempty/missing tables, changed history and catalog',async()=>{
  const {validateSnapshot}=await import('./integration/sql-unit-of-work.mjs');
  const manifest={files:{'up.sql':{sha256:'a'.repeat(64)},'verify.sql':{sha256:'b'.repeat(64)},'down.development.sql':{sha256:'c'.repeat(64)}}};
  const history=[{MigrationId:'0001_initial',UpSha256:'a'.repeat(64),VerifySha256:'b'.repeat(64),DownSha256:'c'.repeat(64),CatalogSha256:'d'.repeat(64)}];
  const value={state:'ONLINE',tableCount:8,observerTransactionCount:0,rowCounts:JSON.stringify(tables.map(tableName=>({tableName,total_registros:0}))),history:JSON.stringify(history),catalogHash:'d'.repeat(64)};
  assert.equal(validateSnapshot(value,manifest).rows.length,8);
  assert.throws(()=>validateSnapshot({...value,rowCounts:JSON.stringify([{tableName:tables[0],total_registros:1}])},manifest));
  assert.throws(()=>validateSnapshot({...value,catalogHash:'e'.repeat(64)},manifest));
  assert.throws(()=>validateSnapshot({...value,history:'[]'},manifest));
});
