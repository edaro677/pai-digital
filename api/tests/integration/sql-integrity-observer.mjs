import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { catalogSql, validateSnapshot, observerDiagnostic } from './sql-unit-of-work.mjs';
import { localOdbcConfig } from '../../.local-build/infrastructure/sql/odbc.js';

// Standalone read-only observer. Never imported by the HTTP composition.
const tables = Object.freeze(['InstitutionalUsers','Dependencies','Fichas','AccessAssignments',
  'Activities','Reports','AuditEvents','IdempotencyRecords']);
export const onlineSql = `SELECT CONVERT(varchar(20),DATABASEPROPERTYEX(DB_NAME(),'Status')) AS state,@@TRANCOUNT AS observerTransactionCount;`;
export const countSql = name => {
  assert.ok(tables.includes(name));
  return `SELECT '${name}' AS tableName,COUNT_BIG(*) AS total_registros FROM pai.${name};`;
};
export const historySql = `SELECT MigrationId,UpSha256,VerifySha256,DownSha256,CatalogSha256 FROM pai_meta.SchemaMigrations ORDER BY MigrationId;`;
export const tableCountSql = `SELECT COUNT(*) AS tableCount FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pai');`;
export function fingerprintSql(verifier) {
  const combined=catalogSql(verifier);
  const end=combined.indexOf('    SELECT CONVERT(varchar(20),DATABASEPROPERTYEX');
  assert.ok(end>0);
  return combined.slice(0,end)+'SELECT @CatalogHash AS catalogHash;';
}
// Aggregate technical evidence only; no SQL text, principals, hostnames or session identities.
export const waitsSql = `SELECT COUNT(*) AS activeRequests,
 COALESCE(SUM(CASE WHEN blocking_session_id>0 THEN 1 ELSE 0 END),0) AS blockedRequests,
 COALESCE(SUM(CASE WHEN wait_type LIKE N'LCK[_]M[_]SCH[_]%' THEN 1 ELSE 0 END),0) AS metadataLockWaits,
 COALESCE(SUM(CASE WHEN wait_type IS NOT NULL THEN 1 ELSE 0 END),0) AS waitingRequests
 FROM sys.dm_exec_requests WHERE session_id<>@@SPID AND database_id=DB_ID();`;
// The installed driver delivers its final rows callback before its done event.
// Await both signals so the next command cannot race the previous completion.
export function nativeRead(connection, sql, parameters=[]) {
  return new Promise((resolve,reject)=>{
    let collected=[],finalRows=false,done=false,settled=false;
    const finish=()=>{
      if(!settled&&finalRows&&done){settled=true;resolve(collected);}
    };
    const operation=connection.query({query_str:sql,query_timeout:10},parameters,(error,rows,more)=>{
      if(error){if(!settled){settled=true;reject(error);}return;}
      if(Array.isArray(rows)&&rows.length)collected=rows;
      if(!more){finalRows=true;finish();}
    });
    operation.once('done',()=>{done=true;finish();});
    // Retain a handler for late native errors; never let EventEmitter print raw data.
    operation.on('error',error=>{if(!settled){settled=true;reject(error);}});
  });
}
export const stateSql = `SELECT
 CASE WHEN LOWER(ORIGINAL_LOGIN()) COLLATE Latin1_General_100_BIN2=LOWER(CONVERT(nvarchar(256),?)) COLLATE Latin1_General_100_BIN2
 AND ORIGINAL_LOGIN()=SUSER_SNAME() THEN 1 ELSE 0 END AS expectedIdentity,
 DB_NAME() AS databaseName,CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName')) AS instanceName,
 CONNECTIONPROPERTY('net_transport') AS transport,CONNECTIONPROPERTY('auth_scheme') AS authentication,
 @@TRANCOUNT AS ownTransactions;`;
export const permissionsSql = `SELECT
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS metadataRead,
 HAS_PERMS_BY_NAME('pai_meta.SchemaMigrations','OBJECT','SELECT') AS historyRead,
 ${tables.map(name=>`HAS_PERMS_BY_NAME('pai.${name}','OBJECT','SELECT') AS select${name}`).join(',\n ')},
 HAS_PERMS_BY_NAME(NULL,NULL,'VIEW SERVER PERFORMANCE STATE') AS transactionObservationAllowed;`;
// Uses existing server principal metadata, not SUSER_SID(name) / Windows account resolution.
export const transactionsSql = `SELECT
 CASE WHEN EXISTS(SELECT 1 FROM sys.server_principals p WHERE p.type='U'
 AND LOWER(p.name) COLLATE Latin1_General_100_BIN2=LOWER(CONVERT(sysname,SERVERPROPERTY('MachineName'))+NCHAR(92)+N'PAIPOC_Test') COLLATE Latin1_General_100_BIN2) THEN 1 ELSE 0 END AS writerKnown,
 (SELECT COUNT(*) FROM sys.dm_tran_session_transactions st JOIN sys.dm_exec_sessions s ON s.session_id=st.session_id
 WHERE s.session_id<>@@SPID AND s.is_user_process=1 AND st.is_user_transaction=1
 AND (s.program_name IN (N'PAI-L8C2-Transport',N'PAI-L8C2-Observer',N'PAI-L8D5-Observer',N'PAI-L8E4-Admin')
 OR s.security_id IN(SELECT p.sid FROM sys.server_principals p WHERE p.type='U'
 AND LOWER(p.name) COLLATE Latin1_General_100_BIN2=LOWER(CONVERT(sysname,SERVERPROPERTY('MachineName'))+NCHAR(92)+N'PAIPOC_Test') COLLATE Latin1_General_100_BIN2))) AS testTransactions;`;
function currentWindowsIdentity() {
  // Private child->parent pipe only. The principal never enters logs, files or evidence.
  const value = execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoLogo','-NoProfile','-NonInteractive','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().Name'],
    {encoding:'utf8',windowsHide:true,shell:false,timeout:5000,maxBuffer:2048,stdio:['ignore','pipe','pipe']}).trim();
  assert.match(value,/^[^\\\r\n]+\\[^\\\r\n]+$/);assert.ok(value.length<=256);
  return value;
}
const stages = new Set(['WINDOWS_IDENTITY','CONNECT','IDENTITY_QUERY','IDENTITY_VALIDATION',
  'MINIMUM_PERMISSIONS_QUERY','MINIMUM_PERMISSIONS_VALIDATION','INITIAL_CATALOG_QUERY','INITIAL_SNAPSHOT_VALIDATION',
  'ABANDONED_TRANSACTIONS_QUERY','ABANDONED_TRANSACTIONS_VALIDATION']);
for(const name of ['ONLINE_QUERY','HISTORY_QUERY','TABLE_COUNT_QUERY','CATALOG_FINGERPRINT_QUERY','WAIT_SNAPSHOT_QUERY',
  ...tables.map(name=>'COUNT_'+name)])stages.add(name);
export async function observeIntegrity(native, { windowsIdentity = currentWindowsIdentity } = {}) {
  let connection, expectedIdentity;
  let stage = 'INITIAL_SNAPSHOT_VALIDATION';
  const began = performance.now();
  const evidence = {status:'FAILED',observer:'single-native-connection',openAttempts:0,closed:false,
    integrityConfirmed:false,transactionObservation:'NOT_REACHED',abandonedTestTransactions:null,stages:[]};
  const timed = async (name, operation) => {
    stage=name;const start=performance.now();let result='failed';
    try {const value=await operation();result='ok';return value;}
    finally {evidence.stages.push({stage:name,result,durationMs:Math.round((performance.now()-start)*100)/100});}
  };
  const query = (sql, parameters=[]) => nativeRead(connection,sql,parameters);
  try {
    const r1dir=new URL('../../migrations/verifiers/0001_initial/r1/',import.meta.url);
    const r1=JSON.parse(await readFile(new URL('manifest.json',r1dir),'utf8'));
    const manifestBytes=await readFile(new URL('../../migrations/manifest.json',import.meta.url));
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(manifestBytes),r1.originalManifest.sha256);
    const manifest=JSON.parse(manifestBytes);
    for(const file of Object.values(manifest.files))assert.equal(hash(await readFile(new URL('../../migrations/'+file.path,import.meta.url))),file.sha256);
    for(const file of Object.values(r1.files))assert.equal(hash(await readFile(new URL(file.path,r1dir))),file.sha256);
    const verifier=await readFile(new URL('verify.sql',r1dir),'utf8');
    expectedIdentity=await timed('WINDOWS_IDENTITY',async()=>windowsIdentity());
    assert.ok(typeof expectedIdentity==='string'&&expectedIdentity.length>0);
    const config=localOdbcConfig();
    evidence.openAttempts=1;
    connection=await timed('CONNECT',()=>new Promise((resolve,reject)=>native.open({
      conn_str:config.connectionString,conn_timeout:config.connectionTimeout/1000,
    },(error,value)=>error?reject(error):resolve(value))));
    const [identity]=await timed('IDENTITY_QUERY',()=>query(stateSql,[expectedIdentity]));
    stage='IDENTITY_VALIDATION';
    assert.equal(identity.expectedIdentity,1);assert.equal(identity.databaseName,'pai_poc_dev');assert.equal(identity.instanceName,'PAIPOC');
    assert.equal(identity.transport,'Shared memory');assert.ok(['NTLM','KERBEROS'].includes(identity.authentication));
    assert.equal(identity.ownTransactions,0);
    Object.assign(evidence,{identityUnchanged:true,windowsIdentityMatchesSql:true,sharedMemory:true,windowsIntegrated:true,ownTransactions:0});
    expectedIdentity=null;
    const [permissions]=await timed('MINIMUM_PERMISSIONS_QUERY',()=>query(permissionsSql));
    stage='MINIMUM_PERMISSIONS_VALIDATION';
    for(const field of ['metadataRead','historyRead',...tables.map(name=>'select'+name)])assert.equal(permissions[field],1);
    evidence.minimumReadPermissions=true;
    if(permissions.transactionObservationAllowed===1){
      const [waits]=await timed('WAIT_SNAPSHOT_QUERY',()=>query(waitsSql));
      for(const name of ['activeRequests','blockedRequests','metadataLockWaits','waitingRequests']){
        assert.ok(Number.isSafeInteger(waits[name])&&waits[name]>=0);
      }
      evidence.waitSnapshot=Object.fromEntries(['activeRequests','blockedRequests','metadataLockWaits','waitingRequests'].map(k=>[k,waits[k]]));
    }
    const [online]=await timed('ONLINE_QUERY',()=>query(onlineSql));
    assert.equal(online.state,'ONLINE');assert.equal(online.observerTransactionCount,0);
    const counts=[];
    for(const name of tables){
      const [count]=await timed('COUNT_'+name,()=>query(countSql(name)));
      assert.equal(count.tableName,name);assert.match(String(count.total_registros),/^0$/);counts.push(count);
    }
    const history=await timed('HISTORY_QUERY',()=>query(historySql));
    assert.equal(history.length,1);assert.equal(history[0].MigrationId,'0001_initial');
    for(const [name,field]of [['up.sql','UpSha256'],['verify.sql','VerifySha256'],['down.development.sql','DownSha256']]){
      assert.equal(history[0][field].toLowerCase(),manifest.files[name].sha256);
    }
    const [inventory]=await timed('TABLE_COUNT_QUERY',()=>query(tableCountSql));assert.equal(inventory.tableCount,8);
    const [fingerprint]=await timed('CATALOG_FINGERPRINT_QUERY',()=>query(fingerprintSql(verifier)));
    const row={...online,...inventory,...fingerprint,rowCounts:JSON.stringify(counts),history:JSON.stringify(history)};
    stage='INITIAL_SNAPSHOT_VALIDATION';const checked=validateSnapshot(row,manifest);
    Object.assign(evidence,{integrityConfirmed:true,online:true,tables:checked.rows,historyHashesMatch:true,catalogHashMatches:true});
    if(permissions.transactionObservationAllowed===1){
      evidence.transactionObservation='FAILED';
      const [transactions]=await timed('ABANDONED_TRANSACTIONS_QUERY',()=>query(transactionsSql));
      stage='ABANDONED_TRANSACTIONS_VALIDATION';
      assert.equal(transactions.writerKnown,1);assert.equal(transactions.testTransactions,0);
      evidence.transactionObservation='CONFIRMED';evidence.abandonedTestTransactions=0;
    }else{
      // Metadata/read permissions are independently mandatory; server-wide DMV access is not.
      evidence.transactionObservation=permissions.transactionObservationAllowed===0
        ? 'NOT_OBSERVABLE_PERMISSION' : 'PERMISSION_NOT_CONFIRMED';
    }
    evidence.status='OK';
  }catch(error){
    evidence.diagnostic={...observerDiagnostic(stage,error),precondition:stages.has(stage)?stage:'UNKNOWN'};
    const nodes=[error,...(Array.isArray(error?.details)?error.details:[]),...(Array.isArray(error)?error:[])].filter(Boolean);
    const codes=new Set(['HYT00','HYT01','08001','08003','28000','IM002','EREQUEST','ETIMEOUT']);
    evidence.safeNativeCodes=[...new Set(nodes.flatMap(n=>[n.code,n.sqlstate,n.sqlState]).filter(c=>codes.has(c)))];
    const numbers=new Set([2,5,53,233,258,18456,18452]);
    evidence.safeNativeNumbers=[...new Set(nodes.flatMap(n=>[n.number,n.native,n.nativeError,n.code])
      .filter(n=>typeof n==='number'||typeof n==='string'&&/^\d+$/.test(n)).map(Number).filter(n=>numbers.has(n)))];
  }finally{
    expectedIdentity=null;
    if(connection){
      const start=performance.now();let result='failed';
      try{await new Promise((resolve,reject)=>connection.close(error=>error?reject(error):resolve()));evidence.closed=true;result='ok';}
      catch{evidence.status='FAILED';evidence.cleanupFailed=true;}
      finally{evidence.stages.push({stage:'CLOSE',result,durationMs:Math.round((performance.now()-start)*100)/100});}
    }
    evidence.durationMs=Math.round((performance.now()-began)*100)/100;
  }
  return evidence;
}
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--check'||process.platform!=='win32'||process.arch!=='x64'
    ||!process.versions.node.startsWith('24.')||process.env.NODE_ENV==='production'
    ||['WEBSITE_INSTANCE_ID','WEBSITE_SITE_NAME','WEBSITE_HOSTNAME','IDENTITY_ENDPOINT','MSI_ENDPOINT','CONTAINER_APP_NAME'].some(k=>!!process.env[k]))throw new Error('LOCAL_READ_ONLY_MODE_REQUIRED');
  const native=(await import('../../node_modules/msnodesqlv8/lib/sql.js')).default;
  const evidence=await observeIntegrity(native);console.log(JSON.stringify(evidence));process.exitCode=evidence.status==='OK'?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{console.log(JSON.stringify({status:'FAILED',category:'LOCAL_READ_ONLY_OBSERVER_FAILED'}));process.exitCode=1;});
}
