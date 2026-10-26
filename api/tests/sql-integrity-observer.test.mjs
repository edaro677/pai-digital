import test from 'node:test';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeRead, observeIntegrity, stateSql, permissionsSql, transactionsSql, onlineSql, countSql, historySql, tableCountSql, waitsSql } from './integration/sql-integrity-observer.mjs';
const manifest=JSON.parse(await readFile(new URL('../migrations/manifest.json',import.meta.url)));
const hash='a'.repeat(64);
const history={MigrationId:'0001_initial',UpSha256:manifest.files['up.sql'].sha256,
  VerifySha256:manifest.files['verify.sql'].sha256,DownSha256:manifest.files['down.development.sql'].sha256,CatalogSha256:hash};
const privatePrincipal='EMPRESA\\usuario.prueba';
const observe=native=>observeIntegrity(native,{windowsIdentity:()=>privatePrincipal});
function fake({state={},permissions={},snapshot={},transactions={},openError,queryError,errorAt=stateSql,closeError}={}){
  const calls={opens:0,queries:[],closes:0};
  const connection={
    query(options,parameters,callback){
      const operation=new EventEmitter();
      setImmediate(()=>{
      calls.queries.push({...options,parameters});
      if(queryError&&options.query_str===errorAt)return callback(queryError);
      let row;
      if(options.query_str===stateSql){
        assert.deepEqual(parameters,[privatePrincipal]);
        row={expectedIdentity:1,databaseName:'pai_poc_dev',instanceName:'PAIPOC',transport:'Shared memory',authentication:'NTLM',ownTransactions:0,...state};
      }else if(options.query_str===permissionsSql){
        row={metadataRead:1,historyRead:1,transactionObservationAllowed:1,
          ...Object.fromEntries(manifest.functionalTables.map(t=>['select'+t,1])),...permissions};
      }else if(options.query_str===waitsSql){row={activeRequests:0,blockedRequests:0,metadataLockWaits:0,waitingRequests:0};}
      else if(options.query_str===onlineSql){row={state:'ONLINE',observerTransactionCount:0,...snapshot};}
      else if(manifest.functionalTables.some(t=>options.query_str===countSql(t))){
        const name=manifest.functionalTables.find(t=>options.query_str===countSql(t));
        row=JSON.parse(snapshot.rowCounts??JSON.stringify(manifest.functionalTables.map(tableName=>({tableName,total_registros:0})))).find(r=>r.tableName===name);
      }else if(options.query_str===historySql){return callback(null,JSON.parse(snapshot.history??JSON.stringify([history])),false);}
      else if(options.query_str===tableCountSql){row={tableCount:8,...snapshot};}
      else if(options.query_str===transactionsSql){row={writerKnown:1,testTransactions:0,...transactions};}
      else{row={state:'ONLINE',tableCount:8,observerTransactionCount:0,
        rowCounts:JSON.stringify(manifest.functionalTables.map(tableName=>({tableName,total_registros:0}))),
        history:JSON.stringify([history]),catalogHash:hash,...snapshot};}
      callback(null,[row],false);
      });
      setImmediate(()=>operation.emit('done'));
      return operation;
    },
    close(callback){calls.closes++;callback(closeError);},
  };
  return {calls,native:{open(options,callback){calls.opens++;assert.equal(options.conn_timeout,10);callback(openError,openError?undefined:connection);}}};
}
const secret=privatePrincipal+' C:\\Privado\\usuario.prueba Password=ficticia;';
const privateError=(code='EREQUEST')=>Object.assign(new Error(secret),{code,sqlstate:'42000',number:258,stack:secret,originalError:{message:secret}});
test('one native connection, separate identity/permissions/catalog/DMV, confirmed close',async()=>{
  const f=fake(),result=await observe(f.native);
  assert.equal(result.status,'OK');assert.equal(result.closed,true);assert.equal(result.integrityConfirmed,true);
  assert.equal(result.tables.length,8);assert.equal(result.abandonedTestTransactions,0);
  assert.equal(f.calls.opens,1);assert.equal(f.calls.closes,1);assert.equal(f.calls.queries.length,16);
  assert.deepEqual(f.calls.queries.slice(0,2).map(q=>q.query_str),[stateSql,permissionsSql]);
  assert.equal(f.calls.queries[15].query_str,transactionsSql);
  for(const q of f.calls.queries){assert.equal(q.query_timeout,10);assert.doesNotMatch(q.query_str,/\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC|CREATE|ALTER|DROP|COMMIT|ROLLBACK)\b/i);}
  for(const event of result.stages){assert.equal(event.result,'ok');assert.ok(Number.isFinite(event.durationMs)&&event.durationMs>=0);}
  assert.doesNotMatch(JSON.stringify(result),/EMPRESA|usuario\.prueba|Privado|Password/);
});
test('identity/minimum rights do not resolve writer SID, require sysadmin or access DMV',()=>{
  for(const sql of [stateSql,permissionsSql])assert.doesNotMatch(sql,/sys\.dm_|SUSER_SID|IS_SRVROLEMEMBER|PAIPOC_Test/i);
  assert.match(permissionsSql,/VIEW DEFINITION/);assert.match(permissionsSql,/VIEW SERVER PERFORMANCE STATE/);
  assert.match(transactionsSql,/sys\.server_principals/);assert.doesNotMatch(transactionsSql,/SUSER_SID/);
});
for(const [name,settings]of[
  ['another Windows identity',{state:{expectedIdentity:0}}],
  ['another instance',{state:{instanceName:'another-instance'}}],
  ['another database',{state:{databaseName:'another-db'}}],
  ['wrong transport',{state:{transport:'TCP'}}],
  ['SQL authentication',{state:{authentication:'SQL'}}],
  ['missing catalog visibility',{permissions:{metadataRead:0}}],
  ['unknown history permission',{permissions:{historyRead:null}}],
  ['missing SELECT',{permissions:{selectReports:0}}],
  ['functional rows',{snapshot:{rowCounts:JSON.stringify(manifest.functionalTables.map(tableName=>({tableName,total_registros:1})))}}],
  ['history mismatch',{snapshot:{history:JSON.stringify([{...history,UpSha256:'b'.repeat(64)}])}}],
  ['catalog mismatch',{snapshot:{catalogHash:'b'.repeat(64)}}],
  ['unresolved transaction identity',{transactions:{writerKnown:0}}],
  ['abandoned transaction',{transactions:{testTransactions:1}}],
])test('fails closed: '+name,async()=>{
  const f=fake(settings),result=await observe(f.native);
  assert.equal(result.status,'FAILED');assert.equal(result.closed,true);assert.equal(f.calls.closes,1);
});
test('server DMV rights absent: integrity still strictly validated, transactions explicitly unobserved',async()=>{
  const f=fake({permissions:{transactionObservationAllowed:0}}),result=await observe(f.native);
  assert.equal(result.status,'OK');assert.equal(result.integrityConfirmed,true);assert.equal(result.minimumReadPermissions,true);
  assert.equal(result.abandonedTestTransactions,null);assert.equal(result.transactionObservation,'NOT_OBSERVABLE_PERMISSION');
  assert.equal(f.calls.queries.length,14);assert.ok(!f.calls.queries.some(q=>q.query_str===transactionsSql));
});
test('unknown DMV permission is explicit, never reported as zero abandoned transactions',async()=>{
  const f=fake({permissions:{transactionObservationAllowed:null}}),result=await observe(f.native);
  assert.equal(result.status,'OK');assert.equal(result.integrityConfirmed,true);
  assert.equal(result.transactionObservation,'PERMISSION_NOT_CONFIRMED');assert.equal(result.abandonedTestTransactions,null);
  assert.equal(f.calls.queries.length,14);
});
test('identity query error remains primary and sanitized if close also fails',async()=>{
  const f=fake({queryError:privateError(),closeError:privateError()}),result=await observe(f.native);
  assert.equal(result.status,'FAILED');assert.equal(result.closed,false);assert.equal(result.cleanupFailed,true);
  assert.equal(result.diagnostic.precondition,'IDENTITY_QUERY');assert.equal(result.diagnostic.code,'EREQUEST');
  assert.deepEqual(result.safeNativeNumbers,[258]);assert.doesNotMatch(JSON.stringify(result),/usuario\.prueba|Privado|Password|originalError|stack|EMPRESA/);
  assert.equal(f.calls.opens,1);assert.equal(f.calls.closes,1);
});
test('DMV error after integrity is preserved, never silently converted into a clean observation',async()=>{
  const f=fake({queryError:privateError(),errorAt:transactionsSql}),result=await observe(f.native);
  assert.equal(result.integrityConfirmed,true);assert.equal(result.status,'FAILED');assert.equal(result.closed,true);
  assert.equal(result.diagnostic.precondition,'ABANDONED_TRANSACTIONS_QUERY');assert.equal(result.abandonedTestTransactions,null);
});
test('failed open: no queries, no retry and distinct stage',async()=>{
  const f=fake({openError:privateError()}),result=await observe(f.native);
  assert.equal(result.status,'FAILED');assert.equal(result.diagnostic.precondition,'CONNECT');
  assert.equal(f.calls.opens,1);assert.equal(f.calls.queries.length,0);assert.equal(f.calls.closes,0);
});
test('close failure cannot turn validated integrity into overall success',async()=>{
  const f=fake({closeError:privateError()}),result=await observe(f.native);
  assert.equal(result.integrityConfirmed,true);assert.equal(result.status,'FAILED');assert.equal(result.closed,false);
});
test('CLI without explicit mode exits before native SQL load',()=>{
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./integration/sql-integrity-observer.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true});
  assert.equal(child.status,1);assert.equal(child.stderr,'');assert.deepEqual(JSON.parse(child.stdout),{status:'FAILED',category:'LOCAL_READ_ONLY_OBSERVER_FAILED'});
});

for(const [stage,sql]of [['ONLINE_QUERY',onlineSql],['COUNT_Reports',countSql('Reports')],['HISTORY_QUERY',historySql]])test('split query failure is localized: '+stage,async()=>{
  const f=fake({queryError:privateError('HYT00'),errorAt:sql});const r=await observe(f.native);
  assert.equal(r.status,'FAILED');assert.equal(r.diagnostic.precondition,stage);assert.equal(r.closed,true);
  assert.ok(r.safeNativeCodes.includes('HYT00'));assert.equal(f.calls.opens,1);
});

test('native read awaits final callback AND done, handles both orders',async()=>{
  for(const doneFirst of [true,false]){
    const operation=new EventEmitter();let callback;
    const p=nativeRead({query(_o,_p,cb){callback=cb;return operation;}},'SELECT 1');
    let settled=false;p.then(()=>{settled=true;});
    if(doneFirst)operation.emit('done');else callback(null,[{n:1}],false);
    await Promise.resolve();assert.equal(settled,false);
    if(doneFirst)callback(null,[{n:1}],false);else operation.emit('done');
    assert.deepEqual(await p,[{n:1}]);
  }
});
test('native callback error rejects without waiting for done or publishing original error',async()=>{
  const op=new EventEmitter();let cb;const error=privateError();
  const p=nativeRead({query(_o,_p,callback){cb=callback;return op;}},'SELECT 1');
  cb(error);await assert.rejects(p,e=>e===error);op.emit('error',privateError());
});
