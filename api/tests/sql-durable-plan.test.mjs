import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const names = ['01_prepare.parents.sql', '02_verify.result.sql', '03_cleanup.admin.sql', '04_cleanup.parents-only.admin.sql'];
const [prepare, verify, cleanup, partial] = await Promise.all(names.map(name => readFile(new URL('../scripts/sql/l8e4-durable/' + name, import.meta.url), 'utf8')));
const tables = ['InstitutionalUsers','Dependencies','Fichas','Activities','AccessAssignments','Reports','AuditEvents','IdempotencyRecords'];
test('reviewed script hashes match the exact four SQL files',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../scripts/sql/l8e4-durable/sha256.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(),[...names].sort());
  for(const name of names){
    const bytes=await readFile(new URL('../scripts/sql/l8e4-durable/'+name,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest[name]);
  }
  // Read-only Git filtering simulation: no index update and no object writes (-w).
  const cwd=fileURLToPath(new URL('../../',import.meta.url));
  for(const name of [...names,'sha256.json']){
    const path='api/scripts/sql/l8e4-durable/'+name;
    const git=(...args)=>execFileSync('git',['-c','core.autocrlf=true','hash-object',...args,path],{cwd,encoding:'utf8',windowsHide:true}).trim();
    assert.equal(git('--path='+path),git('--no-filters'),'Git must preserve the approved bytes: '+name);
  }
});
test('all drafts fail closed on target and do not change permissions, schema or history', () => {
  for (const sql of [prepare, verify, cleanup, partial]) {
    assert.match(sql, /DB_NAME\(\)<>N'pai_poc_dev'/);
    assert.match(sql, /InstanceName/); assert.match(sql, /N'PAIPOC'/); assert.match(sql, /Shared memory/);
    assert.match(sql, /IF @@TRANCOUNT<>0 THROW/);
    const executable = sql.replace(/--[^\r\n]*/g, '').replace(/N?'(?:''|[^'])*'/gi, "''");
    assert.doesNotMatch(executable, /\b(?:ALTER|CREATE|DROP|TRUNCATE|GRANT|DENY|REVOKE|EXEC(?:UTE)?)\b/i);
    assert.doesNotMatch(executable, /pai_meta\.|SchemaMigrations|sp_executesql|\$\(/i);
  }
});
test('parent-only cleanup refuses any POST result and can delete only the exact six parents', () => {
  assert.match(partial, /COALESCE\(IS_SRVROLEMEMBER\(N'sysadmin'\),0\)<>1/);
  assert.match(partial, /CLEAN_SYNTHETIC_PARENTS_ONLY/);
  assert.match(partial, /DirectoryObjectId=@Actor/);
  for (const table of ['Reports','AuditEvents','IdempotencyRecords']) {
    assert.ok(partial.includes(`FROM pai.${table} WITH(TABLOCKX,HOLDLOCK))<>0`));
    assert.ok(!partial.includes(`DELETE FROM pai.${table}`));
  }
  for (const table of ['InstitutionalUsers','Dependencies','Fichas','Activities']) assert.ok(partial.includes(`FROM pai.${table} WITH(TABLOCKX,HOLDLOCK))<>1`));
  assert.ok(partial.includes('FROM pai.AccessAssignments WITH(TABLOCKX,HOLDLOCK))<>2'));
  const deletes=[...partial.matchAll(/DELETE FROM pai\.(\w+) WHERE ([^;]+);/g)];
  assert.deepEqual(deletes.map(m=>m[1]),['AccessAssignments','Activities','Fichas','Dependencies','InstitutionalUsers']);
  for(const match of deletes){assert.match(match[2],/^Id(?:=| IN)/);assert.doesNotMatch(match[2],/LIKE|\bOR\b/);}
  assert.equal((partial.match(/IF @@ROWCOUNT<>/g)??[]).length,5);
  assert.match(partial,/SET XACT_ABORT ON/);assert.match(partial,/SERIALIZABLE/);
  assert.match(partial,/BEGIN CATCH[\s\S]*ROLLBACK TRANSACTION/);
  assert.ok(partial.indexOf('COMMIT TRANSACTION')>partial.lastIndexOf('IF @@ROWCOUNT<>'));
});
test('audit deletion requires hashes returned by independent verification and rechecks them under locks',()=>{
  for(const name of ['AuditSnapshotSha256','OutcomeSnapshotSha256'])assert.ok(verify.includes(name));
  for(const key of ['audit_snapshot_sha256','outcome_snapshot_sha256'])assert.ok(cleanup.includes(key));
  for(const field of ['@VerifiedAuditHash','@VerifiedOutcomeHash']){
    assert.ok(cleanup.includes(`DATALENGTH(${field})<>128`));
    assert.ok(cleanup.includes(`=${field} COLLATE Latin1_General_100_BIN2`));
  }
  assert.ok(cleanup.indexOf('HASHBYTES')<cleanup.indexOf('DELETE FROM pai.AuditEvents'));
});
test('parent preparation requires separate approvals and empty complete inventory', () => {
  assert.match(prepare, /COALESCE\(IS_SRVROLEMEMBER\(N'sysadmin'\),0\)<>1/);
  for (const flag of ['PREPARE_SYNTHETIC_PARENTS_ONLY', 'positive_policy_approved', 'actor_object_id']) assert.ok(prepare.includes(flag));
  for (const table of tables) assert.ok(prepare.includes(`FROM pai.${table} WITH(TABLOCKX,HOLDLOCK)`));
  assert.match(prepare, /DATALENGTH\(@RawActor\)<>72/);
  assert.match(prepare, /DATALENGTH\(@RawFrom\)<>48/);
  assert.match(prepare, /@From<@Now AND @Now<@Until/);
  assert.equal((prepare.match(/INSERT pai\./g) ?? []).length, 5);
  for (const sql of [prepare, cleanup]) {
    assert.match(sql, /SET XACT_ABORT ON/); assert.match(sql, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
    assert.match(sql, /BEGIN TRANSACTION/); assert.match(sql, /BEGIN CATCH[\s\S]*ROLLBACK TRANSACTION/);
    assert.equal((sql.match(/COMMIT TRANSACTION/g) ?? []).length, 1);
  }
});
test('verification is read-only and checks exact historical result and decimal text', () => {
  assert.doesNotMatch(verify.replace(/--[^\r\n]*/g,''), /\b(?:INSERT|UPDATE|DELETE|MERGE|COMMIT)\b/i);
  assert.match(verify, /READ_DURABLE_RESULT_ONLY/);
  assert.match(verify, /DATALENGTH\(r.QuantityText\)=DATALENGTH\('9007199254740993\.000100'\)/);
  assert.match(verify, /a.AfterJson COLLATE Latin1_General_100_BIN2=i.OutcomeReportJson/);
  assert.match(verify, /JSON_VALUE\(a.AfterJson,'\$\.version'\)/);
  assert.match(verify, /poc:completed/); assert.match(verify, /CompletedAt IS NOT NULL/);
});
test('cleanup is exact, separately approved, ordered by FK and atomic', () => {
  assert.match(cleanup, /COALESCE\(IS_SRVROLEMEMBER\(N'sysadmin'\),0\)<>1/);
  for (const flag of ['CLEAN_SYNTHETIC_L8E4_R01_ONLY','synthetic_audit_deletion_approved','actor_object_id','report_id']) assert.ok(cleanup.includes(flag));
  for (const table of tables) assert.ok(cleanup.includes(`FROM pai.${table} WITH(TABLOCKX,HOLDLOCK)`));
  const deletes = [...cleanup.matchAll(/DELETE FROM pai\.(\w+) WHERE ([^;]+);/g)];
  assert.deepEqual(deletes.map(m => m[1]), ['IdempotencyRecords','AuditEvents','Reports','AccessAssignments','Activities','Fichas','Dependencies','InstitutionalUsers']);
  for (const match of deletes) { assert.match(match[2], /^Id(?:=| IN)/); assert.doesNotMatch(match[2], /LIKE|\bOR\b/); }
  assert.equal((cleanup.match(/IF @@ROWCOUNT<>/g) ?? []).length, 8);
  assert.match(cleanup, /DirectoryObjectId=@Actor/);
  assert.ok(cleanup.indexOf('COMMIT TRANSACTION') > cleanup.lastIndexOf('IF @@ROWCOUNT<>'));
});
