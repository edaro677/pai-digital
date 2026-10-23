// Test-only local CLI. No native loading without explicit --observe or --writer.
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SqlSessionRunner } from '../../.local-build/infrastructure/sql/session.js';
import { LocalOdbcTransport, localOdbcConfig } from '../../.local-build/infrastructure/sql/odbc.js';
import { runJoint, newLedger, tables, stateSql, checkState, diagnosticFixtureDriver } from '../helpers/sql-joint-work.mjs';

const api=fileURLToPath(new URL('../../',import.meta.url));
const directory=path.join(api,'.test-tmp','l8d5-joint');
const descriptorPath=path.join(directory,'descriptor.json');
const resultPath=path.join(directory,'result.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowedCodes=new Set(['SQL_CONNECT_FAILED','SQL_BEGIN_FAILED','SQL_QUERY_FAILED','SQL_WORK_FAILED',
  'SQL_CODEC_INVALID','SQL_ROLLBACK_FAILED','SQL_CLOSE_FAILED','SQL_SESSION_CLOSED','SQL_SESSION_PENDING',
  'INCOMPATIBLE_STATE','VERSION_CONFLICT']);
const errorCode=error=>allowedCodes.has(error?.code)?error.code:'L8D5_CHECK_FAILED';

export function writerCategory(status,category) {
  return status==='OK'?null:allowedCodes.has(category)?category:'L8D5_CHECK_FAILED';
}

// Closed projection for the observer only; never copies messages or native objects.
export function observerDiagnostic(precondition,error) {
  const stages=['CONNECT','INITIAL_CATALOG_QUERY','INITIAL_SNAPSHOT_VALIDATION','OBSERVATION_RIGHTS_QUERY',
    'OBSERVATION_RIGHTS_VALIDATION','LISTEN','LOOPBACK_VALIDATION','DESCRIPTOR_WRITE','READY_ONLY_CLOSE'];
  const codes=['EREQUEST','ETIMEOUT','ETIMEDOUT','ELOGIN','ESOCKET','ECANCEL','ERR_ASSERTION','EADDRINUSE','EACCES'];
  const nodes=[error,error?.originalError,error?.originalError?.info,
    ...(Array.isArray(error?.originalError)?error.originalError:[])];
  const safeValue=value=>typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null
    ?value:typeof value==='string'&&(/^[0-9a-f]{64}$/.test(value)||['ONLINE','127.0.0.1','0001_initial'].includes(value))?value:'[redacted]';
  return Object.freeze({precondition:stages.includes(precondition)?precondition:'UNKNOWN',
    errorClass:['RequestError','ConnectionError','AssertionError','TypeError','Error'].includes(error?.name)?error.name:'OTHER',
    code:nodes.map(e=>e?.code).find(c=>codes.includes(c))??null,
    sqlNumbers:[...new Set(nodes.flatMap(e=>[e?.number,e?.native,e?.nativeError]).filter(n=>Number.isInteger(n)&&n>=0&&n<=2147483647))],
    sqlState:nodes.flatMap(e=>[e?.sqlstate,e?.sqlState,e?.state]).find(s=>['42000','23000','HY000','HYT00','HYT01','08001','08003','28000'].includes(s))??null,
    expected:error instanceof assert.AssertionError?safeValue(error.expected):null,
    actual:error instanceof assert.AssertionError?safeValue(error.actual):null});
}

export function catalogSql(verifier) {
  const start=verifier.indexOf('DECLARE @Catalog nvarchar(max), @CatalogHash varchar(64);');
  const end=verifier.indexOf('\nIF (SELECT COUNT(*) FROM pai_meta.SchemaMigrations)',start);
  assert.ok(start>=0&&end>start);
  const catalog=verifier.slice(start,end);
  assert.doesNotMatch(catalog,/\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC|CREATE|ALTER|DROP|COMMIT|ROLLBACK)\b/i);
  const counts=tables.map(name=>`SELECT '${name}' AS tableName,COUNT_BIG(*) AS total_registros FROM pai.${name}`).join(' UNION ALL ');
  return `SET NOCOUNT ON; ${catalog}
    SELECT CONVERT(varchar(20),DATABASEPROPERTYEX(DB_NAME(),'Status')) AS state,
    (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pai')) AS tableCount,
    (SELECT tableName,total_registros FROM (${counts}) r FOR JSON PATH) AS rowCounts,
    (SELECT MigrationId,UpSha256,VerifySha256,DownSha256,CatalogSha256,
      CONVERT(varchar(24),AppliedAtUtc,126) AS AppliedAtUtc FROM pai_meta.SchemaMigrations ORDER BY MigrationId FOR JSON PATH) AS history,
    @CatalogHash AS catalogHash,@@TRANCOUNT AS observerTransactionCount;`;
}
export function validateSnapshot(value,manifest) {
  assert.equal(value.state,'ONLINE');assert.equal(value.tableCount,8);assert.equal(value.observerTransactionCount,0);
  const rows=JSON.parse(value.rowCounts),history=JSON.parse(value.history);
  assert.deepEqual(rows.map(x=>x.tableName).sort(),[...tables].sort());
  for(const row of rows)assert.match(String(row.total_registros),/^0$/);
  assert.equal(history.length,1);assert.equal(history[0].MigrationId,'0001_initial');
  for(const [name,field] of [['up.sql','UpSha256'],['verify.sql','VerifySha256'],['down.development.sql','DownSha256']])
    assert.equal(history[0][field].toLowerCase(),manifest.files[name].sha256);
  assert.match(value.catalogHash,/^[0-9a-f]{64}$/);assert.equal(history[0].CatalogSha256.toLowerCase(),value.catalogHash);
  return {state:value.state,rows,history,catalogHash:value.catalogHash};
}
export function classifyResidual(rows) {
  if(rows.length===0)return {classification:'A',warning:null,abandonedTransactions:0};
  assert.equal(rows.length,1);const r=rows[0];assert.equal(r.status,'sleeping');
  for(const key of ['transactions','requests','userTransactions','blocks','waits'])assert.equal(r[key],0);
  return {classification:'B',warning:'CONNECTION_STILL_VISIBLE',abandonedTransactions:0};
}
function jsonLines(socket,onMessage) {
  let buffer='';socket.setEncoding('utf8');
  socket.on('data',chunk=>{
    buffer+=chunk;if(buffer.length>65536){socket.destroy();return;}
    let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);
      try{onMessage(JSON.parse(line));}catch{socket.destroy();}}
  });
}
const send=(socket,message)=>socket.write(JSON.stringify(message)+'\n');

async function observer({readyOnly=false}={}) {
  assert.equal(process.platform,'win32');assert.notEqual(process.env.NODE_ENV,'production');
  await mkdir(directory,{recursive:true});
  const manifest=JSON.parse(await readFile(path.join(api,'migrations','manifest.json'),'utf8'));
  for(const file of Object.values(manifest.files))assert.equal(digest(await readFile(path.join(api,'migrations',file.path))),file.sha256);
  const r1dir=path.join(api,'migrations','verifiers','0001_initial','r1');
  const r1=JSON.parse(await readFile(path.join(r1dir,'manifest.json'),'utf8'));
  for(const file of Object.values(r1.files))assert.equal(digest(await readFile(path.join(r1dir,file.path))),file.sha256);
  assert.equal(digest(await readFile(path.join(api,'migrations','manifest.json'))),r1.originalManifest.sha256);
  const verifier=await readFile(path.join(r1dir,'verify.sql'),'utf8');
  // Exact catalog serialization extracted from checksum-verified R1. No verifier/migration execution.
  const sqlText=catalogSql(verifier);
  const driver=(await import('mssql/msnodesqlv8.js')).default;
  const config=localOdbcConfig();config.connectionString=config.connectionString.replace('APP=PAI-L8C2-Transport;','APP=PAI-L8D5-Observer;');
  const pool=new driver.ConnectionPool(config);pool.on('error',()=>{});
  const summary={status:'FAILED',initialIntegrity:false,finalIntegrity:false,writer:null,observerReadOnly:true};
  let precondition='CONNECT';
  let before,captured,server,writerSocket,deadline,finishing=false,finishResolve;
  const finished=new Promise(resolve=>{finishResolve=resolve;});
  const query=async text=>(await new driver.Request(pool).query(text)).recordset;
  const snapshot=async()=>validateSnapshot((await query(sqlText))[0],manifest);
  async function correlate() {
    if(!captured)return {classification:'D',warning:null,abandonedTransactions:null};
    const request=new driver.Request(pool);
    request.input('sid',driver.Int,captured.sessionId);request.input('loginTime',driver.VarChar(23),captured.loginTime);
    request.input('connectionId',driver.UniqueIdentifier,captured.connectionId);
    const rows=(await request.query(`SELECT s.status,s.open_transaction_count AS transactions,
      (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id=s.session_id) AS requests,
      (SELECT COUNT(*) FROM sys.dm_tran_session_transactions WHERE session_id=s.session_id AND is_user_transaction=1) AS userTransactions,
      (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id=s.session_id AND blocking_session_id<>0) AS blocks,
      (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id=s.session_id AND wait_type IS NOT NULL) AS waits
      FROM sys.dm_exec_sessions s JOIN sys.dm_exec_connections c ON c.session_id=s.session_id
      WHERE s.session_id=@sid AND CONVERT(varchar(23),s.login_time,126)=@loginTime AND c.connection_id=@connectionId;`)).recordset;
    return classifyResidual(rows);
  }
  async function finish(writerResult,reason) {
    if(finishing)return;finishing=true;clearTimeout(deadline);
    summary.writer=writerResult;if(reason)summary.failure=reason;
    try{summary.observation=await correlate();}catch{summary.observation={classification:'E'};summary.failure??='OBSERVATION_FAILED';}
    // Always try final integrity independently; success cannot erase a writer/cleanup failure.
    try{const after=await snapshot();assert.deepEqual(after,before);summary.finalIntegrity=true;summary.emptyTables=8;summary.historyUnchanged=true;summary.catalogUnchanged=true;}
    catch{summary.finalIntegrity=false;summary.finalIntegrityFailure='FINAL_SNAPSHOT_NOT_VERIFIED';}
    if(writerResult?.status==='OK'&&summary.initialIntegrity&&summary.finalIntegrity&&!summary.failure
      &&['A','B'].includes(summary.observation.classification))summary.status='OK';
    try{await pool.close();summary.observerClosed=true;}catch{summary.observerClosed=false;summary.status='FAILED';}
    captured=null;
    await writeFile(resultPath,JSON.stringify(summary,null,2));console.log(JSON.stringify({stage:'L8D5_FINISHED',...summary}));
    if(writerSocket&&!writerSocket.destroyed)writerSocket.end(JSON.stringify({ok:summary.status==='OK',finished:true})+'\n');
    if(server)server.close();finishResolve();
  }
  try {
    await pool.connect();
    precondition='INITIAL_CATALOG_QUERY';const initialRows=await query(sqlText);
    precondition='INITIAL_SNAPSHOT_VALIDATION';before=validateSnapshot(initialRows[0],manifest);summary.initialIntegrity=true;
    precondition='OBSERVATION_RIGHTS_QUERY';
    const [rights]=await query(`SELECT CASE WHEN HAS_PERMS_BY_NAME(NULL,'SERVER','VIEW SERVER PERFORMANCE STATE')=1
      OR IS_SRVROLEMEMBER('sysadmin')=1 THEN 1 ELSE 0 END AS canObserve;`);
    precondition='OBSERVATION_RIGHTS_VALIDATION';assert.equal(rights.canObserve,1);
    const runId=randomUUID();let authenticated=false,captureUsed=false;
    server=net.createServer(socket=>{
      if(readyOnly){socket.destroy();return;}
      if(writerSocket){socket.destroy();return;}writerSocket=socket;
      let chain=Promise.resolve();
      jsonLines(socket,message=>{chain=chain.then(async()=>{
        assert.equal(message.runId,runId);
        if(message.type==='HELLO'){assert.equal(authenticated,false);authenticated=true;send(socket,{ok:true});return;}
        assert.equal(authenticated,true);
        if(message.type==='CAPTURE'){
          assert.equal(captureUsed,false);captureUsed=true;
          assert.ok(Number.isInteger(message.sessionId)&&message.sessionId>0&&message.sessionId<=32767);
          assert.match(message.loginTime,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?$/);
          const request=new driver.Request(pool);request.input('sid',driver.Int,message.sessionId);
          request.input('loginTime',driver.VarChar(23),message.loginTime);
          const rows=(await request.query(`SELECT s.session_id AS sessionId,CONVERT(varchar(23),s.login_time,126) AS loginTime,
            CONVERT(varchar(36),c.connection_id) AS connectionId,c.net_transport AS transport,
            s.open_transaction_count AS transactions
            FROM sys.dm_exec_sessions s JOIN sys.dm_exec_connections c ON c.session_id=s.session_id
            WHERE s.session_id=@sid AND CONVERT(varchar(23),s.login_time,126)=@loginTime
            AND s.security_id=SUSER_SID(CONVERT(sysname,SERVERPROPERTY('MachineName'))+N'\\PAIPOC_Test');`)).recordset;
          assert.equal(rows.length,1);assert.equal(rows[0].transport,'Shared memory');assert.equal(rows[0].transactions,1);
          assert.match(rows[0].connectionId,/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);captured=rows[0];
          send(socket,{ok:true});return;
        }
        if(message.type==='FINISH'){
          const r=message.result;
          // Strict projection: no caller-supplied SQL, result rows or connection identities are persisted.
          const safe={status:r?.status==='OK'?'OK':'FAILED',stage:typeof r?.stage==='string'&&/^[A-Za-z.]+$/.test(r.stage)?r.stage:'UNKNOWN',
            category:r?.status==='OK'?null:(allowedCodes.has(r?.category)?r.category:'L8D5_CHECK_FAILED'),
            methods:Array.isArray(r?.methods)?r.methods.filter(x=>/^(users|assignments|fichas|activities|reports|audit|idempotency)\.[a-zA-Z]+$/.test(x)):[],
            assertionsComplete:r?.assertionsComplete===true,rollbackSucceeded:r?.rollbackSucceeded===true,closeSucceeded:r?.closeSucceeded===true,
            closedContextRejected:r?.closedContextRejected===true,sameSessionAtEnd:r?.sameSessionAtEnd===true,
            staleVersionRejected:r?.staleVersionRejected===true,historicalResultPreserved:r?.historicalResultPreserved===true,
            connections:r?.connections===1?1:0,begins:r?.begins===1?1:0,commitAttempts:r?.commitAttempts===0?0:1,pending:r?.pending===0?0:1};
          if(safe.status==='OK'){
            for(const key of ['assertionsComplete','rollbackSucceeded','closeSucceeded','closedContextRejected','sameSessionAtEnd','staleVersionRejected','historicalResultPreserved'])assert.equal(safe[key],true);
            assert.equal(safe.methods.length,19);assert.equal(safe.connections,1);assert.equal(safe.begins,1);
            assert.equal(safe.commitAttempts,0);assert.equal(safe.pending,0);
          }
          await finish(safe);return;
        }
        throw new Error('PROTOCOL_REJECTED');
      }).catch(async()=>{await finish(null,'OBSERVER_PROTOCOL_FAILED');});});
      socket.on('error',()=>{void finish(null,'WRITER_CHANNEL_FAILED');});
      socket.on('close',()=>{if(!finishing)void finish(null,'WRITER_DISCONNECTED');});
    });
    precondition='LISTEN';
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    precondition='LOOPBACK_VALIDATION';
    const address=server.address();assert.equal(address.address,'127.0.0.1');
    precondition='DESCRIPTOR_WRITE';
    await writeFile(descriptorPath,JSON.stringify({host:'127.0.0.1',port:address.port,runId}));
    console.log(JSON.stringify({stage:'L8D5_READY',initialIntegrity:true,emptyTables:8,historyValid:true,catalogValid:true,observerReadOnly:true,loopbackOnly:true}));
    if(readyOnly){
      // This diagnostic mode never accepts a writer or enters its protocol.
      precondition='READY_ONLY_CLOSE';
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      await pool.close();
      console.log(JSON.stringify({stage:'L8D5_READY_ONLY_CLOSED',status:'OK',observerClosed:true,writerStarted:false,writes:0}));
      return;
    }
    deadline=setTimeout(()=>{void finish(null,'WRITER_NOT_COMPLETED');},600000); // Bound for human launch, not a changed SQL timeout.
    await finished;
  } catch(error){summary.preconditionDiagnostic=observerDiagnostic(precondition,error);await finish(null,'OBSERVER_PRECONDITION_FAILED');}
  process.exitCode=summary.status==='OK'?0:1;
}
async function writer() {
  assert.equal(userInfo().username.toLowerCase(),'paipoc_test');
  const descriptor=JSON.parse(await readFile(descriptorPath,'utf8'));
  assert.equal(descriptor.host,'127.0.0.1');assert.ok(Number.isInteger(descriptor.port)&&descriptor.port>0&&descriptor.port<65536);
  const socket=net.createConnection({host:'127.0.0.1',port:descriptor.port});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  let awaiting;
  jsonLines(socket,message=>{const pending=awaiting;awaiting=undefined;if(!pending)return;
    if(message.ok)pending.resolve(message);else pending.reject(new Error('OBSERVER_REFUSED'));});
  socket.on('error',()=>{awaiting?.reject(new Error('CHANNEL_FAILED'));awaiting=undefined;});
  socket.on('close',()=>{awaiting?.reject(new Error('CHANNEL_CLOSED'));awaiting=undefined;});
  const rpc=message=>new Promise((resolve,reject)=>{assert.equal(awaiting,undefined);awaiting={resolve,reject};send(socket,{runId:descriptor.runId,...message});});
  await rpc({type:'HELLO'});
  const ledger=newLedger();let category='L8D5_CHECK_FAILED',status='FAILED';
  try{
    const transport=new LocalOdbcTransport({loadDriver:async()=>diagnosticFixtureDriver(
      (await import('mssql/msnodesqlv8.js')).default,evidence=>{ledger.fixtureDiagnostic=evidence;})});
    await runJoint(transport,{ledger,capture:identity=>rpc({type:'CAPTURE',...identity})});status='OK';
  }catch(error){category=errorCode(error);}
  const result={...ledger,status,category:writerCategory(status,category)};
  console.log(JSON.stringify({stage:'L8D5_WRITER_FINISHED',...result}));
  let ok=false;
  try{ok=(await rpc({type:'FINISH',result})).ok;}catch{ok=false;}finally{socket.destroy();}
  process.exitCode=status==='OK'&&ok?0:1;
}
// Isolated read-only diagnostic: exact state query, rollback, no fixtures or observer.
async function stateOnly() {
  assert.equal(userInfo().username.toLowerCase(),'paipoc_test');
  const trace=[];let diagnostic=null,primary=null,passed=false;
  const transport=new LocalOdbcTransport({loadDriver:async()=>(await import('mssql/msnodesqlv8.js')).default,
    trace:true,onTrace:event=>trace.push(event)});
  try {
    await new SqlSessionRunner(transport).run('rollback',async session=>{
      const [row]=await session.execute({text:stateSql,parameters:[]});
      checkState(row,evidence=>{diagnostic=evidence;});passed=true;
    });
  }catch(error){primary=errorCode(error);}
  const rollbackSucceeded=trace.some(e=>e.stage==='ROLLBACK'&&e.result==='ok');
  const closeSucceeded=trace.some(e=>e.stage==='CLOSE'&&e.result==='ok');
  const result={status:passed&&!primary&&rollbackSucceeded&&closeSucceeded?'OK':'FAILED',
    operation:'state-only',category:primary,diagnostic,rollbackSucceeded,closeSucceeded,
    writes:0,commitAttempts:trace.filter(e=>e.stage==='COMMIT').length,
    queryCount:trace.filter(e=>e.stage==='QUERY').length,
    technicalFailures:trace.filter(e=>e.result==='failed').map(e=>({stage:e.stage,category:e.category,technicalCode:e.technicalCode??null}))};
  await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'state-only-result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));process.exitCode=result.status==='OK'?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const mode=process.argv[2];
  const main=mode==='--observe'?observer:mode==='--observe-ready-only'?()=>observer({readyOnly:true}):mode==='--writer'?writer:mode==='--state-only'?stateOnly:async()=>{throw new Error('EXPLICIT_MODE_REQUIRED');};
  main().catch(error=>{console.log(JSON.stringify({status:'FAILED',category:errorCode(error)}));process.exitCode=1;});
}
