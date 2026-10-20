import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Inspeccion de archivos, sin procesos SQL, red o escrituras de base de datos.
const root = new URL('../migrations/', import.meta.url);
const revisionRoot = new URL('verifiers/0001_initial/r1/', root);
const bytes = await readFile(new URL('manifest.json', root));
const originalManifest = JSON.parse(bytes);
const revision = JSON.parse(await readFile(new URL('manifest.json', revisionRoot), 'utf8'));
const names = ['verify.sql', 'down.development.sql'];
const originals = Object.fromEntries(await Promise.all(names.map(async name =>
  [name, await readFile(new URL(`0001_initial/${name}`, root), 'utf8')])));
const scripts = Object.fromEntries(await Promise.all(names.map(async name =>
  [name, await readFile(new URL(name, revisionRoot), 'utf8')])));
const sha = value => createHash('sha256').update(value).digest('hex');

function checkArtifacts(candidate) {
  assert.deepEqual(Object.keys(candidate).sort(), [...names].sort());
  for (const name of names) {
    assert.equal(revision.files[name].path, name);
    assert.match(revision.files[name].sha256, /^[0-9a-f]{64}$/);
    assert.ok(!candidate[name].includes('\r'));
    assert.equal(sha(candidate[name]), revision.files[name].sha256);
  }
}

test('R1: descriptor enlaza exactamente manifiesto y terna originales', () => {
  assert.equal(revision.formatVersion, 1);
  assert.equal(revision.revision, 'r1');
  assert.equal(revision.migrationId, '0001_initial');
  assert.equal(revision.originalManifest.path, '../../../manifest.json');
  assert.equal(revision.originalManifest.sha256, sha(bytes));
  assert.deepEqual(revision.originalFiles, originalManifest.files);
  assert.equal(revision.executionPolicy, 'local-synthetic-only');
  assert.equal(revision.historyPolicy, 'compare-original-hashes-without-writing');
  assert.match(revision.reason, /468/);
  assert.deepEqual(Object.keys(revision.files).sort(), [...names].sort());
});

test('R1: hashes exactos y alteraciones de cualquiera de los auxiliares detectadas', () => {
  checkArtifacts(scripts);
  for (const name of names) {
    assert.throws(() => checkArtifacts({ ...scripts, [name]: scripts[name] + '-- cambio\n' }));
  }
});

test('R1: unico cambio de catalogo es COLLATE en Kind y o.type; resto conservado', () => {
  for (const name of names) {
    const restored = scripts[name]
      .replace(/^.*\n/, originals[name].slice(0, originals[name].indexOf('\n') + 1))
      .replace(/-- BEGIN R1 SESSION GUARD\n[\s\S]*?-- END R1 SESSION GUARD\n/, '')
      .replace('Kind COLLATE Latin1_General_100_BIN2 FROM @ExpectedConstraints', 'Kind FROM @ExpectedConstraints')
      .replace('o.type COLLATE Latin1_General_100_BIN2 FROM', 'o.type FROM');
    assert.equal(restored, originals[name]);
    assert.match(scripts[name], /Kind COLLATE Latin1_General_100_BIN2 FROM @ExpectedConstraints EXCEPT SELECT s\.name,t\.name,o\.name,o\.type COLLATE Latin1_General_100_BIN2 FROM/);
  }
});

test('R1: serializacion y hash de catalogo permanecen identicos al original', () => {
  const catalog = text => {
    const start = text.indexOf('-- Firma del catalogo');
    return text.slice(start, text.indexOf('\nIF (SELECT COUNT(*)', start));
  };
  for (const name of names) {
    assert.ok(catalog(originals[name]).length > 1000);
    assert.equal(catalog(scripts[name]), catalog(originals[name]));
  }
});

test('R1: contexto obligatorio, revision exacta, hashes canonicos y guardas previas a transaccion', () => {
  for (const sql of Object.values(scripts)) {
    for (const key of ['pai.verifier.revision', 'pai.verifier.verifySha256', 'pai.verifier.downSha256']) {
      assert.ok(sql.includes(`SESSION_CONTEXT(N'${key}')`));
    }
    assert.match(sql, /@R1Revision IS NULL OR @R1Revision COLLATE Latin1_General_100_BIN2<>N'r1' OR DATALENGTH\(@R1Revision\)<>4/);
    assert.match(sql, /@R1Verify IS NULL OR @R1Down IS NULL OR DATALENGTH\(@R1Verify\)<>128 OR DATALENGTH\(@R1Down\)<>128/);
    assert.match(sql, /@R1Verify COLLATE Latin1_General_100_BIN2 LIKE N'%\[\^0-9a-f\]%'/);
    assert.match(sql, /@R1Down COLLATE Latin1_General_100_BIN2 LIKE N'%\[\^0-9a-f\]%'/);
    for (const code of [51030, 51031, 51032]) assert.ok(sql.indexOf(`THROW ${code}`) < sql.indexOf('BEGIN TRANSACTION;'));
  }
});

test('R1: solo terna aplicada permitida y comparacion de historial no omitida', () => {
  for (const sql of Object.values(scripts)) {
    for (const [variable, name] of [['Up', 'up.sql'], ['Verify', 'verify.sql'], ['Down', 'down.development.sql']]) {
      assert.ok(sql.includes(`@${variable} COLLATE Latin1_General_100_BIN2<>N'${originalManifest.files[name].sha256}'`));
    }
    assert.match(sql, /UpSha256=@Up AND VerifySha256=@Verify AND DownSha256=@Down AND CatalogSha256=@CatalogHash/);
    assert.match(sql, /COUNT\(\*\) FROM pai_meta\.SchemaMigrations\)<>1/);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?pai_meta\./i);
  }
});

test('R1: verify conserva solo lectura y aislamiento local sin nuevas conexiones', () => {
  const sql = scripts['verify.sql'];
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|GRANT|DENY|REVOKE)\s+(?:TABLE|ROLE|SCHEMA|INDEX|DATABASE)\b/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?pai(?:_meta)?\./i);
  assert.doesNotMatch(sql, /^\s*:(?:connect|r|!!)\b/im);
  for (const token of ['LOCAL_SYNTHETIC_ONLY', 'EngineEdition', '127.0.0.1', '::1', 'SET XACT_ABORT ON', 'SERIALIZABLE', 'ROLLBACK TRANSACTION']) {
    assert.ok(sql.includes(token));
  }
});

test('R1: down mantiene confirmacion, rol vacio, bloqueos y ocho comprobaciones antes de DROP', () => {
  const sql = scripts['down.development.sql'];
  assert.match(sql, /pai\.migration\.rollback/);
  assert.match(sql, /DROP_EMPTY_0001_INITIAL/);
  assert.match(sql, /role_principal_id=DATABASE_PRINCIPAL_ID\(N'pai_api_runtime'\)/);
  const checks = [...sql.matchAll(/SELECT 1 FROM pai\.\w+ WITH \(TABLOCKX,HOLDLOCK\)/g)];
  assert.equal(checks.length, 8);
  for (const check of checks) assert.ok(check.index < sql.indexOf('DROP TABLE'));
  assert.doesNotMatch(sql, /\bTRUNCATE\b|\bDROP\s+DATABASE\b|\bDELETE\s+FROM\b/i);
});
