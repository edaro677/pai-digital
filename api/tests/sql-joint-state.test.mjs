import test from 'node:test';
import assert from 'node:assert/strict';
import { checkState } from './helpers/sql-joint-work.mjs';
const good=()=>({expectedIdentity:1,sysadmin:0,dbOwner:0,controlServer:0,controlDatabase:0,
 databaseName:'pai_poc_dev',transport:'Shared memory',transactionCount:1,transactionState:1,isolation:4,
 sessionId:17,loginTime:'2026-01-02T03:04:05.000'});
test('stateBefore: valid state preserves strict acceptance without diagnostics',()=>{
 const events=[];checkState(good(),e=>events.push(e));assert.deepEqual(events,[]);
});
test('stateBefore: exact failing field and types are preserved before SQL_WORK_FAILED sanitization',()=>{
 let evidence;assert.throws(()=>checkState({...good(),transactionCount:0},e=>{evidence=e;}),assert.AssertionError);
 assert.equal(evidence.field,'transactionCount');assert.equal(evidence.expected,1);assert.equal(evidence.actual,0);
 assert.equal(evidence.actualType,'number');assert.equal(evidence.originalErrorType,'AssertionError');assert.equal(evidence.sqlErrorNumber,null);
 assert.match(evidence.connectionTag,/^[0-9a-f]{12}$/);
});
test('stateBefore: string numerics do not get coerced into accepted numbers',()=>{
 let evidence;assert.throws(()=>checkState({...good(),isolation:'4'},e=>{evidence=e;}));
 assert.equal(evidence.field,'isolation');assert.equal(evidence.actualType,'string');
});
test('stateBefore: synthetic private values never escape the explicit projection',()=>{
 const secret='EMPRESA\\usuario.prueba C:\\Privado\\usuario.prueba Password=ficticia';
 for(const field of ['databaseName','transport','expectedIdentity']){
  let evidence;assert.throws(()=>checkState({...good(),[field]:secret},e=>{evidence=e;}));
  assert.equal(JSON.stringify(evidence).includes(secret),false);assert.equal(evidence.field,field);
 }
});
test('stateBefore: reporting failure cannot suppress the original assertion',()=>{
 assert.throws(()=>checkState({...good(),sysadmin:1},()=>{throw new Error('observer failure');}),assert.AssertionError);
});

test('stateBefore: unknown CONTROL SERVER remains a blocking failure rather than becoming zero',()=>{
 let evidence;assert.throws(()=>checkState({...good(),controlServer:null},e=>{evidence=e;}),assert.AssertionError);
 assert.equal(evidence.field,'controlServer');assert.equal(evidence.expected,0);assert.equal(evidence.actual,null);
});
