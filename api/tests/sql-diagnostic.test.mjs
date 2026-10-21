import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { assertSqlDiagnosticEnvironment, sqlDiagnosticConfig } from '../scripts/sql-diagnostic-config.mjs';
import { runSqlDiagnostic } from '../scripts/sql-diagnostic.mjs';

const runtime = { platform: 'win32', arch: 'x64', versions: { node: '24.22.0' } };

test('SQL diagnostico: destino fijo, sin claves ni DSN heredados y una conexion', () => {
  const config = sqlDiagnosticConfig();
  assert.equal(config.server, 'lpc:.\\PAIPOC');
  assert.equal(config.database, 'pai_poc_dev');
  assert.equal(config.driver, 'ODBC Driver 17 for SQL Server');
  assert.match(config.connectionString, /Server=lpc:\.\\PAIPOC;/);
  assert.match(config.connectionString, /Trusted_Connection=Yes;/);
  assert.doesNotMatch(config.connectionString, /(?:UID|PWD|DSN)=/i);
  assert.equal(config.pool.max, 1);
  assert.equal(config.pool.min, 0);
  config.options.trustedConnection = false;
  assert.equal(sqlDiagnosticConfig().options.trustedConnection, true);
});

test('SQL diagnostico: rechaza otros sistemas, arquitecturas y versiones antes del binding', async () => {
  for (const invalid of [{ ...runtime, platform: 'linux' }, { ...runtime, arch: 'arm64' },
    { ...runtime, versions: { node: '22.0.0' } }]) {
    await assert.rejects(runSqlDiagnostic({ runtime: invalid, env: {},
      loadDriver: () => { throw new Error('No debe cargar binding'); } }),
    error => error.code === 'SQL_DIAGNOSTIC_FAILED');
  }
});

test('SQL diagnostico: indicadores Azure bloqueados antes de conectar', () => {
  for (const key of ['WEBSITE_INSTANCE_ID', 'WEBSITE_SITE_NAME', 'WEBSITE_HOSTNAME',
    'IDENTITY_ENDPOINT', 'MSI_ENDPOINT', 'CONTAINER_APP_NAME']) {
    assert.throws(() => assertSqlDiagnosticEnvironment({ [key]: 'synthetic' }, runtime), /Azure/);
  }
  assert.doesNotThrow(() => assertSqlDiagnosticEnvironment({}, runtime));
});

test('SQL diagnostico: ejecutor sin DML/DDL ni imports desde src; binding solo diferido', async () => {
  const source = await readFile(new URL('../scripts/sql-diagnostic.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:INSERT\s+INTO|UPDATE\s+pai|DELETE\s+FROM|CREATE\s+(?:TABLE|DATABASE)|DROP\s+(?:TABLE|DATABASE)|ALTER\s+(?:TABLE|DATABASE)|MERGE\s+INTO)\b/i);
  assert.doesNotMatch(source, /from ['"][^'"]*src\//);
  assert.match(source, /loadDriver = \(\) => import\('mssql\/msnodesqlv8\.js'\)/);
  assert.match(source, /atStage\('ROLLBACK', 'SQL_TRANSACTION_FAILED', async \(\) => \{\s+await transaction\.rollback\(\);\s+active = false;/);
  assert.match(source, /finally \{\s+if \(active\) \{\s+try \{\s+await atStage\('CLEANUP_ROLLBACK', 'SQL_TRANSACTION_FAILED', async \(\) => \{\s+await transaction\.rollback\(\);/);
  assert.match(source, /atStage\('CLOSE', 'SQL_CONNECTION_FAILED', \(\) => pool\.close\(\)\)/);
  assert.match(source, /if \(primaryError\) throw primaryError;/);
});

test('SQL diagnostico: prueba real excluida del glob ordinario y dependencias solo desarrollo', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs');
  assert.equal(pkg.devDependencies.mssql, '12.7.10');
  assert.equal(pkg.devDependencies.msnodesqlv8, '5.6.0');
  assert.equal(pkg.dependencies.mssql, undefined);
  assert.equal(pkg.dependencies.msnodesqlv8, undefined);
});

test('SQL diagnostico: health funciona y el ejecutor se importa con carga nativa bloqueada', () => {
  const healthUrl = new URL('../.local-build/http/health.js', import.meta.url).href;
  const diagnosticUrl = new URL('../scripts/sql-diagnostic.mjs', import.meta.url).href;
  const source = `
    process.dlopen = () => { throw new Error('Carga nativa bloqueada para esta prueba'); };
    const { health } = await import(${JSON.stringify(healthUrl)});
    const diagnostic = await import(${JSON.stringify(diagnosticUrl)});
    if (health({}, {}).status !== 200 || typeof diagnostic.runSqlDiagnostic !== 'function') process.exitCode = 1;
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
});
