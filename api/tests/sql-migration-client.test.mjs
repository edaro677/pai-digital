import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('migration client: bounded context values, exact binary rowversion and memory guard without SQL',()=>{
  const text=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',
    fileURLToPath(new URL('./sql-migration-client.synthetic.ps1',import.meta.url))],{encoding:'utf8',timeout:10000,windowsHide:true});
  const evidence=JSON.parse(text.trim());assert.equal(evidence.status,'OK');assert.equal(evidence.checks,15);assert.equal(evidence.sqlConnections,0);
});

test('obsolete stage modes cannot open SQL or create a disposable database',()=>{
  for(const mode of ['--create','--up','--test','--down','--drop','--run']){
    let evidence;
    try { execFileSync(process.execPath,[fileURLToPath(new URL('./integration/sql-migration-0002.mjs',import.meta.url)),mode],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}); }
    catch(error){assert.equal(error.status,1);evidence=JSON.parse(error.stdout);}
    assert.equal(evidence?.category,'EXPLICIT_SQLCLIENT_TRIAL_REQUIRED');assert.equal(evidence.sqlConnections,0);
  }
});
