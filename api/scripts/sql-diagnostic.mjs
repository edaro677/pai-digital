import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { assertSqlDiagnosticEnvironment, sqlDiagnosticConfig } from './sql-diagnostic-config.mjs';

// Lecturas y variables locales. Sin DML, migraciones, DDL o composicion HTTP.
const metadataQuery = `SELECT @@VERSION AS serverVersion,
 CONVERT(varchar(40),SERVERPROPERTY('ProductVersion')) AS productVersion,
 CONVERT(nvarchar(128),SERVERPROPERTY('Edition')) AS edition,
 CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName')) AS instanceName,
 CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) AS windowsOnly,
 DB_NAME() AS databaseName, CONNECTIONPROPERTY('net_transport') AS transport,
 IS_SRVROLEMEMBER('sysadmin') AS isSysadmin,
 (SELECT auth_scheme FROM sys.dm_exec_connections WHERE session_id=@@SPID) AS authentication;`;

const historyQuery = `SELECT MigrationId,UpSha256,VerifySha256,DownSha256,CatalogSha256,
 CONVERT(varchar(24),AppliedAtUtc,126) AS AppliedAtUtc
 FROM pai_meta.SchemaMigrations WHERE MigrationId=@migrationId;`;

const tablesQuery = `SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pai') ORDER BY name;`;
const expectedTables = ['AccessAssignments', 'Activities', 'AuditEvents', 'Dependencies',
  'Fichas', 'IdempotencyRecords', 'InstitutionalUsers', 'Reports'];

const publicErrors = Object.freeze({
  SQL_CONNECTION_FAILED: 'No fue posible abrir o cerrar la conexion SQL local.',
  SQL_AUTHENTICATION_FAILED: 'No fue posible autenticar la conexion SQL local.',
  SQL_QUERY_FAILED: 'No fue posible completar las consultas de diagnostico.',
  SQL_TRANSACTION_FAILED: 'No fue posible completar la prueba transaccional.',
  SQL_DIAGNOSTIC_FAILED: 'No fue posible validar el diagnostico SQL local.',
});

export class SqlDiagnosticError extends Error {
  constructor(code = 'SQL_DIAGNOSTIC_FAILED') {
    const allowed = Object.hasOwn(publicErrors, code) ? code : 'SQL_DIAGNOSTIC_FAILED';
    super(publicErrors[allowed]);
    this.name = 'SqlDiagnosticError';
    this.code = allowed;
    // Una excepcion publica tampoco expone rutas locales mediante su stack.
    this.stack = `${this.name}: ${this.message}`;
  }
}

function publicError(error, fallback = 'SQL_DIAGNOSTIC_FAILED') {
  if (error instanceof SqlDiagnosticError) return new SqlDiagnosticError(error.code);
  // Clasificar por codigos conocidos; nunca analizar ni copiar mensajes del driver.
  try {
    if (error?.code === 'ELOGIN' || error?.code === '28000'
        || error?.number === 18456 || error?.number === 18452) {
      return new SqlDiagnosticError('SQL_AUTHENTICATION_FAILED');
    }
  } catch { /* Un objeto de error desconocido no se expone. */ }
  return new SqlDiagnosticError(fallback);
}

const technicalCodes = new Set(['ETIMEOUT', 'EREQUEST', 'ECONNCLOSED', 'ENOTOPEN',
  'ENOCONN', 'ELOGIN', 'EABORT', 'ENOTBEGUN', 'EALREADYBEGUN', 'EREQINPROG',
  'HYT00', 'HYT01', '08001', '08003', '08004', '08006', '28000', 'IM002',
  258, 18456, 18452, 1205, 1222, -2]);

function technicalCode(error) {
  try {
    for (const value of [error?.code, error?.number, error?.originalError?.code,
      error?.originalError?.number, error?.originalError?.info?.number]) {
      if (technicalCodes.has(value)) return value;
    }
  } catch { /* No inspeccionar mensajes ni serializar objetos desconocidos. */ }
  return null;
}

function createStageRunner(enabled, onTrace, state) {
  return async function atStage(stage, category, operation) {
    const started = performance.now();
    const emit = (result, error = null) => {
      if (!enabled) return;
      // Campos y valores construidos explicitamente; nunca filas ni excepciones.
      const record = { stage, durationMs: Math.max(0, Math.round(performance.now() - started)),
        result, category: result === 'ok' ? null : publicError(error, category).code,
        technicalCode: result === 'ok' ? null : technicalCode(error), ...state() };
      // Un fallo del destino de observabilidad no sustituye el resultado SQL.
      try { onTrace(record); } catch { /* Destino sin acceso a errores originales. */ }
    };
    try { const value = await operation(); emit('ok'); return value; }
    catch (error) { emit('failed', error); throw publicError(error, category); }
  };
}

// Lista positiva; no serializar filas SQL, errores ni objetos del controlador.
function projectDiagnosticResult(result) {
  assert.equal(result.status, 'ok');
  assert.equal(result.mode, 'administrative-diagnostic-only');
  assert.match(result.runtime.node, /^24\.\d+\.\d+$/);
  assert.equal(result.runtime.platform, 'win32');
  assert.equal(result.runtime.arch, 'x64');
  assert.match(result.server.productVersion, /^16\.\d+\.\d+\.\d+$/);
  assert.equal(result.server.databaseName, 'pai_poc_dev');
  assert.equal(result.server.transport, 'Shared memory');
  assert.ok(['NTLM', 'KERBEROS'].includes(result.server.authentication));
  assert.equal(typeof result.server.administrative, 'boolean');
  assert.equal(result.migration.migrationId, '0001_initial');
  assert.equal(result.migration.verified, true);
  assert.deepEqual(result.functionalTables, expectedTables);
  assert.deepEqual(result.transaction, { before: 0, during: 1, after: 0,
    afterState: 0, rollback: 'completed', sameSession: true });
  assert.equal(result.pool.borrowedBeforeClose, 0);
  assert.equal(result.pool.pendingBeforeClose, 0);
  assert.equal(result.pool.closed, true);
  return {
    status: 'ok', mode: 'administrative-diagnostic-only',
    runtime: { node: result.runtime.node, platform: 'win32', arch: 'x64' },
    server: { productVersion: result.server.productVersion, databaseName: 'pai_poc_dev',
      transport: 'Shared memory', authentication: result.server.authentication,
      administrative: result.server.administrative },
    migration: { migrationId: '0001_initial', verified: true },
    functionalTables: [...expectedTables],
    transaction: { before: 0, during: 1, after: 0, afterState: 0,
      rollback: 'completed', sameSession: true },
    pool: { borrowedBeforeClose: 0, pendingBeforeClose: 0, closed: true },
  };
}

export function sanitizeDiagnosticResult(result) {
  try { return projectDiagnosticResult(result); }
  catch (error) { throw publicError(error); }
}

async function metadata(sql, owner, atStage, prefix) {
  const server = await atStage(`${prefix}_METADATA`, 'SQL_QUERY_FAILED', async () =>
    (await new sql.Request(owner).query(metadataQuery)).recordset[0]);
  // Capturar antes del SELECT, conservando las comprobaciones 0/1/0.
  const state = await atStage(`${prefix}_STATE`, 'SQL_QUERY_FAILED', async () =>
    (await new sql.Request(owner).query(
      'DECLARE @ObservedCount int=@@TRANCOUNT, @ObservedState smallint=XACT_STATE(); SELECT @@SPID AS sessionId, @ObservedCount AS transactionCount, @ObservedState AS transactionState;'
    )).recordset[0]);
  return { ...server, ...state };
}

async function history(sql, owner, atStage, prefix) {
  return atStage(`${prefix}_HISTORY`, 'SQL_QUERY_FAILED', async () =>
    (await new sql.Request(owner).input('migrationId', sql.VarChar(64), '0001_initial')
      .query(historyQuery)).recordset);
}

function assertTarget(row) {
  assert.equal(row.transport, 'Shared memory', 'No continuar con TCP/IP o Named Pipes.');
  assert.equal(row.databaseName, 'pai_poc_dev');
  assert.equal(row.instanceName, 'PAIPOC');
  assert.match(row.productVersion, /^16\./);
  assert.match(row.edition, /^Developer/);
  assert.equal(row.windowsOnly, 1);
  assert.ok(['NTLM', 'KERBEROS'].includes(row.authentication));
}

async function executeDiagnostic({ loadDriver = () => import('mssql/msnodesqlv8.js'),
  env = process.env, runtime = process, trace = false,
  onTrace = record => console.error(JSON.stringify(record)) } = {}) {
  assertSqlDiagnosticEnvironment(env, runtime);
  assert.equal(typeof trace, 'boolean');
  assert.equal(typeof onTrace, 'function');
  let pool;
  let active = false;
  const atStage = createStageRunner(trace, onTrace, () => {
    let connected = false, borrowed = null, pending = null;
    try {
      connected = pool?.connected === true;
      if (pool?.pool) {
        if (Number.isSafeInteger(pool.borrowed) && pool.borrowed >= 0) borrowed = pool.borrowed;
        if (Number.isSafeInteger(pool.pending) && pool.pending >= 0) pending = pool.pending;
      }
    } catch { /* Los getters del pool no son validos despues del cierre. */ }
    return { connected, borrowed, pending, transactionActive: active };
  });
  // Importacion diferida fuera de src: health y npm test no necesitan cargar el binding.
  const imported = await atStage('DRIVER_LOAD', 'SQL_CONNECTION_FAILED', loadDriver);
  const sql = imported.default ?? imported;
  pool = await atStage('POOL_CREATE', 'SQL_CONNECTION_FAILED', async () => new sql.ConnectionPool(sqlDiagnosticConfig()));
  let poolFailed = false;
  pool.on('error', error => {
    poolFailed = true;
    void atStage('POOL_EVENT', 'SQL_CONNECTION_FAILED', () => { throw error; }).catch(() => {});
  });
  let transaction;
  let report;
  let primaryError;
  try {
    await atStage('CONNECT', 'SQL_CONNECTION_FAILED', () => pool.connect());
    const before = await metadata(sql, pool, atStage, 'BEFORE');
    assertTarget(before);
    assert.equal(before.transactionCount, 0, 'Antes de BEGIN debe haber cero transacciones.');
    assert.equal(before.transactionState, 0, 'Estado inicial sin transaccion.');
    const originalManifest = JSON.parse(await readFile(new URL('../migrations/manifest.json', import.meta.url), 'utf8'));
    const beforeHistory = await history(sql, pool, atStage, 'BEFORE');
    assert.equal(beforeHistory.length, 1);
    for (const [column, file] of [['UpSha256', 'up.sql'], ['VerifySha256', 'verify.sql'], ['DownSha256', 'down.development.sql']]) {
      assert.equal(beforeHistory[0][column], originalManifest.files[file].sha256);
    }
    const tables = await atStage('CATALOG', 'SQL_QUERY_FAILED', async () =>
      (await new sql.Request(pool).query(tablesQuery)).recordset.map(row => row.name));
    assert.deepEqual(tables, expectedTables);

    transaction = new sql.Transaction(pool);
    await atStage('BEGIN', 'SQL_TRANSACTION_FAILED', async () => {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      active = true;
    });
    const during = await metadata(sql, transaction, atStage, 'DURING');
    assertTarget(during);
    assert.equal(during.sessionId, before.sessionId);
    assert.equal(during.transactionCount, 1, 'Dentro de BEGIN debe haber una transaccion.');
    assert.equal(during.transactionState, 1, 'Transaccion activa confirmable.');
    const transactionHistory = await history(sql, transaction, atStage, 'DURING');
    assert.deepEqual(transactionHistory, beforeHistory);
    await atStage('ROLLBACK', 'SQL_TRANSACTION_FAILED', async () => {
      await transaction.rollback();
      active = false;
    });

    const after = await metadata(sql, pool, atStage, 'AFTER');
    assertTarget(after);
    assert.equal(after.sessionId, before.sessionId);
    assert.equal(after.transactionCount, 0, 'Despues de rollback debe haber cero transacciones.');
    assert.equal(after.transactionState, 0, 'Estado despues de rollback sin transaccion.');
    assert.deepEqual(await history(sql, pool, atStage, 'AFTER'), beforeHistory);
    assert.equal(pool.borrowed, 0, 'Pool sin conexiones prestadas tras las consultas.');
    assert.equal(pool.pending, 0, 'Pool sin solicitudes pendientes.');
    if (poolFailed) throw new SqlDiagnosticError('SQL_CONNECTION_FAILED');
    report = { status: 'ok', mode: 'administrative-diagnostic-only',
      runtime: { node: runtime.versions.node, platform: runtime.platform, arch: runtime.arch },
      server: { productVersion: before.productVersion, databaseName: before.databaseName,
        transport: before.transport, authentication: before.authentication,
        administrative: before.isSysadmin === 1 },
      migration: { migrationId: beforeHistory[0].MigrationId, verified: true },
      functionalTables: tables,
      transaction: { before: before.transactionCount, during: during.transactionCount,
        after: after.transactionCount, afterState: after.transactionState, rollback: 'completed',
        sameSession: before.sessionId === after.sessionId },
      pool: { borrowedBeforeClose: pool.borrowed, pendingBeforeClose: pool.pending } };
  } catch (error) {
    primaryError = publicError(error);
  } finally {
    if (active) {
      try {
        await atStage('CLEANUP_ROLLBACK', 'SQL_TRANSACTION_FAILED', async () => {
          await transaction.rollback();
          active = false;
        });
      } catch (error) { primaryError ??= publicError(error); }
    }
    try {
      await atStage('CLOSE', 'SQL_CONNECTION_FAILED', () => pool.close());
    } catch (error) { primaryError ??= publicError(error); }
  }
  if (primaryError) throw primaryError;
  assert.equal(pool.connected, false);
  // mssql elimina la referencia al pool interno al cerrar; sus getters ya no son validos.
  assert.equal(pool.pool, null);
  report.pool.closed = true;
  return report;
}

export async function runSqlDiagnostic(options = {}) {
  try { return sanitizeDiagnosticResult(await executeDiagnostic(options)); }
  catch (error) { throw publicError(error); }
}

export async function sqlDiagnosticCli({ args = process.argv.slice(2), run = runSqlDiagnostic,
  stdout = text => console.log(text), stderr = text => console.error(text) } = {}) {
  try {
    if (args[0] !== '--local' || !(args.length === 1
      || (args.length === 2 && args[1] === '--trace'))) throw new SqlDiagnosticError();
    const result = await run({ trace: args.length === 2,
      onTrace: record => stderr(JSON.stringify(record)) });
    stdout(JSON.stringify(sanitizeDiagnosticResult(result), null, 2));
    return 0;
  } catch (error) {
    const safe = publicError(error);
    stderr(JSON.stringify({ status: 'failed', code: safe.code, message: safe.message }));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await sqlDiagnosticCli();
}
