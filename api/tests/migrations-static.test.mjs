import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Solo texto/JSON local: no controlador SQL, procesos, red ni ejecucion de scripts.
const root = new URL('../migrations/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const names = ['up.sql', 'verify.sql', 'down.development.sql'];
const files = Object.fromEntries(await Promise.all(names.map(async name =>
  [name, await readFile(new URL(`0001_initial/${name}`, root), 'utf8')])));
const tables = ['InstitutionalUsers', 'Dependencies', 'Fichas', 'AccessAssignments', 'Activities', 'Reports', 'AuditEvents', 'IdempotencyRecords'];
const up = files['up.sql'];
const verify = files['verify.sql'];
const down = files['down.development.sql'];

function checkArtifacts(candidate) {
  assert.deepEqual(Object.keys(manifest.files).sort(), [...names].sort());
  for (const name of names) {
    assert.equal(manifest.files[name].path, `0001_initial/${name}`);
    assert.match(manifest.files[name].sha256, /^[0-9a-f]{64}$/);
    assert.ok(!candidate[name].includes('\r'), 'Checksums requieren LF');
    assert.equal(createHash('sha256').update(candidate[name], 'utf8').digest('hex'), manifest.files[name].sha256);
  }
}

test('migracion: manifiesto y SHA-256 exactos, sin rutas externas ni finales CRLF', () => {
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.migrationId, '0001_initial');
  assert.equal(manifest.baseCommit, 'ba6c2b6');
  assert.equal(manifest.status, 'static-only-not-executed');
  assert.deepEqual(manifest.functionalTables, tables);
  checkArtifacts(files);
});

test('migracion: modificar un artefacto sin actualizar el manifiesto se detecta', () => {
  for (const name of names) assert.throws(() => checkArtifacts({ ...files, [name]: files[name] + '-- cambio\n' }));
});

test('migracion: exactamente ocho tablas funcionales y una tecnica; orden sin ciclos', () => {
  assert.deepEqual([...up.matchAll(/CREATE TABLE pai\.(\w+)/g)].map(m => m[1]), tables);
  assert.deepEqual([...up.matchAll(/CREATE TABLE pai_meta\.(\w+)/g)].map(m => m[1]), ['SchemaMigrations']);
  for (const match of up.matchAll(/CREATE TABLE pai\.(\w+) \(([\s\S]*?)\n\);/g)) {
    for (const reference of match[2].matchAll(/REFERENCES pai\.(\w+)/g)) {
      assert.ok(tables.indexOf(reference[1]) < tables.indexOf(match[1]));
    }
  }
});

test('migracion: PK, FK, UNIQUE y ausencia de cascadas', () => {
  for (const table of tables) assert.match(up, new RegExp(`CONSTRAINT PK_${table} PRIMARY KEY CLUSTERED \\(Id\\)`));
  assert.match(up, /UNIQUE \(TenantId, DirectoryObjectId\)/);
  assert.match(up, /UNIQUE \(ActivityId, PeriodKey\)/);
  assert.match(up, /UNIQUE \(ActorId, Operation, IdempotencyKey\)/);
  const references = [...up.matchAll(/FOREIGN KEY[^\n]+/g)];
  assert.equal(references.length, 11);
  for (const reference of references) assert.match(reference[0], /ON DELETE NO ACTION ON UPDATE NO ACTION/);
  assert.doesNotMatch(up, /\bCASCADE\b|\bTokenValues\b|sp_getapplock|\bCREATE\s+DATABASE\b/i);
});

test('migracion: tipos exactos, colacion explicita y versiones actuales separadas de historia', () => {
  assert.equal([...up.matchAll(/Id varchar\(64\) COLLATE Latin1_General_100_BIN2 NOT NULL,/g)].filter(m => /\n    $/.test(up.slice(Math.max(0, m.index - 5), m.index))).length >= 8, true);
  assert.match(up, /PeriodKey nvarchar\(128\) COLLATE Latin1_General_100_BIN2 NOT NULL/);
  assert.match(up, /QuantityText varchar\(max\) COLLATE Latin1_General_100_BIN2 NULL/);
  assert.match(up, /TenantId uniqueidentifier NOT NULL/);
  assert.match(up, /DirectoryObjectId uniqueidentifier NOT NULL/);
  assert.equal([...up.matchAll(/RV rowversion NOT NULL/g)].length, 7);
  assert.doesNotMatch(up, /\b(?:float|money|decimal|numeric)\s*(?:\(|\bNOT)/i);
  for (const name of ['BeforeJson', 'AfterJson', 'OutcomeReportJson']) assert.match(up, new RegExp(`${name} nvarchar\\(max\\)`));
  assert.match(up, /datetime2\(3\)/);
});

test('migracion: nulabilidad de snapshots y outcome comprobada explicitamente', () => {
  assert.match(up, /BeforeJson IS NULL/);
  assert.match(up, /BeforeJson IS NOT NULL AND ISJSON\(BeforeJson, OBJECT\)=1/);
  for (const name of ['CompletedAt', 'OutcomeReportId', 'OutcomeAuditEventId', 'OutcomeReportJson']) {
    assert.match(up, new RegExp(`${name} IS NULL`));
    assert.match(up, new RegExp(`${name} IS NOT NULL`));
  }
  assert.match(up, /ISJSON\(OutcomeReportJson, OBJECT\)=1/);
  assert.doesNotMatch(up, /CHECK\s*\([^;]*ValidUntil\s*>\s*ValidFrom/i);
  assert.doesNotMatch(up, /UNIQUE\s*\(UserId,\s*FichaId,\s*Capability\)/i);
});

test('migracion: orden tecnico de actividades y asignaciones sin version como orden', () => {
  assert.equal([...up.matchAll(/InsertionOrder bigint IDENTITY\(1,1\) NOT NULL/g)].length, 2);
  assert.match(up, /ON pai\.Activities \(FichaId, InsertionOrder\)/);
  assert.match(up, /ON pai\.AccessAssignments \(UserId, FichaId, InsertionOrder\)/);
});

test('migracion: protecciones locales y rollback SQL en los tres artefactos', () => {
  for (const sql of Object.values(files)) {
    assert.match(sql, /SET XACT_ABORT ON/);
    assert.match(sql, /@@TRANCOUNT<>0/);
    assert.match(sql, /pai\[_\]poc\[_\]%/);
    assert.match(sql, /LOCAL_SYNTHETIC_ONLY/);
    assert.match(sql, /EngineEdition/);
    assert.match(sql, /127\.0\.0\.1/);
    assert.match(sql, /::1/);
    assert.match(sql, /BEGIN TRANSACTION/);
    assert.match(sql, /IF XACT_STATE\(\)<>0 ROLLBACK TRANSACTION/);
    assert.match(sql, /THROW;/);
    assert.doesNotMatch(sql, /^\s*GO\s*$/im);
  }
  assert.match(up, /SCHEMA_ID\(N'pai'\) IS NOT NULL/);
  assert.ok(up.indexOf('SCHEMA_ID') < up.indexOf('CREATE TABLE'));
});

test('migracion: verify solo lee y comprueba columnas, restricciones, indices e historial', () => {
  assert.doesNotMatch(verify, /\b(?:CREATE|ALTER|DROP|GRANT|DENY|REVOKE)\s+(?:TABLE|ROLE|SCHEMA|INDEX|SELECT|UPDATE|DELETE|INSERT)\b/i);
  assert.doesNotMatch(verify, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?pai(?:_meta)?\./i);
  for (const token of ['sys.columns', 'sys.types', 'sys.check_constraints', 'sys.foreign_keys', 'sys.indexes',
    'sys.database_permissions', 'is_not_trusted', 'is_disabled', 'delete_referential_action',
    'CatalogSha256', 'UpSha256=@Up', 'VerifySha256=@Verify', 'DownSha256=@Down']) assert.ok(verify.includes(token), token);
  for (const name of [...up.matchAll(/CONSTRAINT (\w+)/g)].map(m => m[1])) assert.ok(verify.includes(`N'${name}'`), name);
  for (const name of [...up.matchAll(/CREATE INDEX (\w+)/g)].map(m => m[1])) assert.ok(verify.includes(`N'${name}'`), name);
});

test('migracion: API con permisos por columna, sin DDL, DELETE ni administracion', () => {
  assert.match(up, /GRANT UPDATE ON OBJECT::pai\.Reports \(QuantityText, Narrative, State, UpdatedBy, UpdatedAt\)/);
  assert.match(up, /DENY DELETE ON SCHEMA::pai TO pai_api_runtime/);
  assert.match(up, /DENY ALTER ON SCHEMA::pai TO pai_api_runtime/);
  assert.match(up, /DENY UPDATE ON OBJECT::pai\.AuditEvents TO pai_api_runtime/);
  assert.match(up, /DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::pai_meta/);
  assert.doesNotMatch(up, /GRANT\s+(?:CONTROL|ALTER|DELETE|CREATE|ALL)|WITH GRANT OPTION|ALTER ROLE|CREATE (?:LOGIN|USER)/i);
});

test('migracion: down exige confirmacion extra, estado integro y ocho tablas vacias', () => {
  assert.match(down, /DROP_EMPTY_0001_INITIAL/);
  assert.match(down, /sys.database_role_members/);
  const firstDrop = down.indexOf('DROP TABLE');
  for (const table of tables) {
    const check = down.indexOf(`SELECT 1 FROM pai.${table} WITH (TABLOCKX,HOLDLOCK)`);
    assert.ok(check > -1 && check < firstDrop);
  }
  assert.deepEqual([...down.matchAll(/DROP TABLE pai\.(\w+);/g)].map(m => m[1]), [...tables].reverse());
  assert.ok(down.indexOf('Historial, checksums') < firstDrop);
  assert.doesNotMatch(down, /\bTRUNCATE\b|\bDROP\s+DATABASE\b|\bDELETE\s+FROM\b/i);
});

test('migracion: LF fijado localmente para no invalidar checksums en Windows', async () => {
  const attributes = await readFile(new URL('.gitattributes', root), 'utf8');
  assert.match(attributes, /^\*\.sql text eol=lf$/m);
  assert.match(attributes, /^\*\.json text eol=lf$/m);
});

test('migracion: terna historica aplicada permanece inmutable tras R1', () => {
  const applied = {
    'up.sql': '29634f596d609ea6b031ed50f1641180d4dd0f2d6fd40ff3357e60a184b1d35f',
    'verify.sql': 'f78cd96c0f31f1b04d34e1b453d483a4433557c7651e41ec95be9faaef2bf9d5',
    'down.development.sql': 'c059d2b65bd06aabb94826d04b0a54c9aa0223e074b6a65b93615bea0acb153e',
  };
  for (const name of names) assert.equal(createHash('sha256').update(files[name], 'utf8').digest('hex'), applied[name]);
});
