import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { readFile } from 'node:fs/promises';
import { runSqlDiagnostic, sqlDiagnosticCli, sanitizeDiagnosticResult } from '../scripts/sql-diagnostic.mjs';

// Exclusivamente valores ficticios; no importar el controlador ni conectar a SQL.
const privateValues = ['EMPRESA\\usuario.prueba', 'usuario.prueba@ejemplo.test',
  'C:\\Privado\\usuario.prueba', 'Server=sql.ejemplo.test;UID=usuario.prueba;PWD=ClaveFicticia-123;'];
const payload = privateValues.join(' | ');
const runtime = { platform: 'win32', arch: 'x64', versions: { node: '24.22.0' } };
const base = JSON.parse(await readFile(new URL('../migrations/manifest.json', import.meta.url), 'utf8'));

function assertPrivate(value) {
  const text = typeof value === 'string' ? value : inspect(value, { depth: 10, showHidden: true });
  for (const marker of privateValues) assert.ok(!text.includes(marker), 'No publicar marcador sintetico');
  assert.ok(!text.includes('ClaveFicticia-123'));
  assert.ok(!text.includes('usuario.prueba'));
}

function rawFailure(code = 'EREQUEST') {
  const error = new Error(payload);
  error.code = code;
  error.stack = payload;
  error.originalError = { message: payload, stack: payload };
  error.cause = { identity: payload };
  return error;
}

function fakeDriver(fail = '', metadataChanges = {}, errorCode = 'EREQUEST') {
  const fails = new Set(Array.isArray(fail) ? fail : [fail]);
  const state = { active: false, closed: false, rolledBack: false, queries: [], cleanup: [] };
  const history = [{ MigrationId: '0001_initial', UpSha256: base.files['up.sql'].sha256,
    VerifySha256: base.files['verify.sql'].sha256, DownSha256: base.files['down.development.sql'].sha256,
    CatalogSha256: 'a'.repeat(64), AppliedAtUtc: '2026-01-01T00:00:00.000', extra: payload }];
  class Pool {
    constructor() { this.connected = false; this.pool = {}; this.borrowed = 0; this.pending = 0; }
    on(_event, handler) { this.errorHandler = handler; }
    async connect() {
      if (fails.has('connect')) throw rawFailure(errorCode);
      if (fails.has('authentication')) throw rawFailure('ELOGIN');
      this.connected = true;
      if (fails.has('event')) this.errorHandler(rawFailure());
    }
    async close() {
      state.cleanup.push('close');
      state.closed = true; this.connected = false; this.pool = null;
      if (fails.has('close')) throw rawFailure(errorCode);
    }
  }
  class Transaction {
    async begin() { if (fails.has('begin')) throw rawFailure(errorCode); state.active = true; }
    async rollback() {
      state.cleanup.push('rollback');
      state.active = false; state.rolledBack = true;
      if (fails.has('rollback')) throw rawFailure(errorCode);
    }
  }
  class Request {
    input() { return this; }
    async query(text) {
      state.queries.push(text);
      if (fails.has('query')) throw rawFailure(errorCode);
      if (fails.has('transaction-query') && state.active) throw rawFailure(errorCode);
      if (text.startsWith('DECLARE')) return { recordset: [{ sessionId: 42,
        transactionCount: state.active ? 1 : 0, transactionState: state.active ? 1 : 0 }] };
      if (text.includes('@@VERSION')) return { recordset: [{ serverVersion: payload,
        productVersion: '16.0.1210.3', edition: 'Developer Edition', instanceName: 'PAIPOC',
        databaseName: 'pai_poc_dev', windowsOnly: 1, transport: 'Shared memory', authentication: 'NTLM',
        isSysadmin: 1, originalLogin: privateValues[0], effectiveLogin: privateValues[1],
        databaseUser: payload, connectionString: privateValues[3], ...metadataChanges }] };
      if (text.includes('SchemaMigrations')) return { recordset: structuredClone(history) };
      return { recordset: ['AccessAssignments', 'Activities', 'AuditEvents', 'Dependencies',
        'Fichas', 'IdempotencyRecords', 'InstitutionalUsers', 'Reports'].map(name => ({ name })) };
    }
  }
  return { state, loadDriver: async () => ({ ConnectionPool: Pool, Transaction, Request,
    VarChar: () => ({}), ISOLATION_LEVEL: { SERIALIZABLE: 4 } }) };
}

async function outputFor(run, args = ['--local']) {
  const stdout = [], stderr = [];
  const code = await sqlDiagnosticCli({ args, run, stdout: value => stdout.push(value), stderr: value => stderr.push(value) });
  assertPrivate(stdout.join('\n')); assertPrivate(stderr.join('\n'));
  return { code, stdout, stderr };
}

test('SQL privacidad: exito con filas contaminadas produce exclusivamente campos permitidos', async () => {
  const fake = fakeDriver();
  const result = await runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver });
  assertPrivate(JSON.stringify(result));
  assert.deepEqual(Object.keys(result.server).sort(), ['administrative', 'authentication',
    'databaseName', 'productVersion', 'transport']);
  assert.deepEqual(result.migration, { migrationId: '0001_initial', verified: true });
  assert.equal(result.server.administrative, true);
  assert.equal(fake.state.closed, true);
  assert.equal(fake.state.rolledBack, true);
  assert.equal(fake.state.active, false);
  assert.deepEqual(fake.state.cleanup, ['rollback', 'close']);
  assert.ok(fake.state.queries.every(text => !/ORIGINAL_LOGIN|SUSER_SNAME|USER_NAME\(/.test(text)));
  const output = await outputFor(async () => ({ ...result, extra: payload,
    server: { ...result.server, identity: payload }, pool: { ...result.pool, secret: payload } }));
  assert.equal(output.code, 0); assert.equal(output.stderr.length, 0);
  assert.deepEqual(JSON.parse(output.stdout[0]), result);
});

test('SQL privacidad: fallo de lectura dentro de transaccion revierte antes de cerrar y falla la CLI', async () => {
  const run = async () => {
    const fake = fakeDriver('transaction-query');
    try {
      return await runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver });
    } finally {
      assert.equal(fake.state.active, false);
      assert.equal(fake.state.rolledBack, true);
      assert.equal(fake.state.closed, true);
      assert.deepEqual(fake.state.cleanup, ['rollback', 'close']);
    }
  };
  await assert.rejects(run(), error => {
    assertPrivate(error);
    return error.code === 'SQL_QUERY_FAILED';
  });
  const output = await outputFor(run);
  assert.equal(output.code, 1);
  assert.deepEqual(output.stdout, []);
  assert.equal(JSON.parse(output.stderr[0]).code, 'SQL_QUERY_FAILED');
});

for (const [phase, expected] of [['connect', 'SQL_CONNECTION_FAILED'], ['authentication', 'SQL_AUTHENTICATION_FAILED'],
  ['query', 'SQL_QUERY_FAILED'], ['begin', 'SQL_TRANSACTION_FAILED'], ['rollback', 'SQL_TRANSACTION_FAILED'],
  ['close', 'SQL_CONNECTION_FAILED'], ['event', 'SQL_CONNECTION_FAILED']]) {
  test(`SQL privacidad: fallo ${phase} no expone excepcion, identidad ni ruta`, async () => {
    const run = async () => {
      const fake = fakeDriver(phase);
      try { return await runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver }); }
      catch (error) {
        assert.equal(fake.state.closed, true);
        assert.equal(error.code, expected);
        assertPrivate(error); assertPrivate(String(error)); assertPrivate(error.stack);
        assert.equal(error.originalError, undefined); assert.equal(error.cause, undefined);
        assert.ok(!error.stack.includes('file:') && !error.stack.includes(' at '));
        throw error;
      }
    };
    await assert.rejects(run(), error => error.code === expected);
    const output = await outputFor(run);
    assert.equal(output.code, 1); assert.equal(output.stdout.length, 0);
    assert.equal(JSON.parse(output.stderr[0]).code, expected);
  });
}

test('SQL privacidad: error de carga nativa queda sanitizado antes de existir pool', async () => {
  const run = () => runSqlDiagnostic({ env: {}, runtime, loadDriver: async () => { throw rawFailure(); } });
  await assert.rejects(run(), error => { assertPrivate(error); return error.code === 'SQL_CONNECTION_FAILED'; });
  assert.equal((await outputFor(run)).code, 1);
});

test('SQL privacidad: valores invalidos que fallan aserciones tampoco se publican', async () => {
  for (const changes of [{ transport: payload }, { productVersion: payload }, { databaseName: payload }]) {
    const fake = fakeDriver('', changes);
    const run = () => runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver });
    await assert.rejects(run(), error => { assertPrivate(error); return error.code === 'SQL_DIAGNOSTIC_FAILED'; });
    assert.equal((await outputFor(run)).code, 1);
  }
});

test('SQL privacidad: CLI no publica argumentos ni errores crudos de ejecucion', async () => {
  const output = await outputFor(async () => { throw rawFailure(); });
  assert.equal(output.code, 1); assert.equal(output.stdout.length, 0);
  assert.equal(JSON.parse(output.stderr[0]).code, 'SQL_DIAGNOSTIC_FAILED');
  const invalid = await outputFor(async () => { throw new Error('No debe ejecutarse'); }, [payload]);
  assert.equal(invalid.code, 1); assert.equal(invalid.stdout.length, 0);
});

test('SQL privacidad: proyeccion publica rechaza datos tecnicos contaminados con error seguro', () => {
  assert.throws(() => sanitizeDiagnosticResult({ status: payload }), error => {
    assertPrivate(error); return error.code === 'SQL_DIAGNOSTIC_FAILED';
  });
});


const expectedStages = ['DRIVER_LOAD', 'POOL_CREATE', 'CONNECT', 'BEFORE_METADATA',
  'BEFORE_STATE', 'BEFORE_HISTORY', 'CATALOG', 'BEGIN', 'DURING_METADATA',
  'DURING_STATE', 'DURING_HISTORY', 'ROLLBACK', 'AFTER_METADATA', 'AFTER_STATE',
  'AFTER_HISTORY', 'CLOSE'];

function assertTrace(records) {
  assertPrivate(JSON.stringify(records));
  for (const record of records) {
    assert.deepEqual(Object.keys(record).sort(), ['stage', 'durationMs', 'result', 'category',
      'technicalCode', 'connected', 'borrowed', 'pending', 'transactionActive'].sort());
    assert.ok([...expectedStages, 'CLEANUP_ROLLBACK', 'POOL_EVENT'].includes(record.stage));
    assert.ok(Number.isSafeInteger(record.durationMs) && record.durationMs >= 0);
    assert.ok(['ok', 'failed'].includes(record.result));
    assert.equal(typeof record.connected, 'boolean');
    assert.equal(typeof record.transactionActive, 'boolean');
    for (const count of [record.borrowed, record.pending]) {
      assert.ok(count === null || (Number.isSafeInteger(count) && count >= 0));
    }
    if (record.result === 'ok') {
      assert.equal(record.category, null);
      assert.equal(record.technicalCode, null);
    } else {
      assert.ok(['SQL_CONNECTION_FAILED', 'SQL_AUTHENTICATION_FAILED', 'SQL_QUERY_FAILED',
        'SQL_TRANSACTION_FAILED', 'SQL_DIAGNOSTIC_FAILED'].includes(record.category));
    }
  }
}

test('SQL traza: desactivada por defecto incluso con destino configurado', async () => {
  const records = [], fake = fakeDriver();
  await runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver, onTrace: e => records.push(e) });
  assert.deepEqual(records, []);
  assert.deepEqual(fake.state.cleanup, ['rollback', 'close']);
});

test('SQL traza: activacion explicita registra etapas, duraciones y estados permitidos', async () => {
  const records = [], fake = fakeDriver();
  const result = await runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver,
    trace: true, onTrace: e => records.push(e) });
  assertTrace(records);
  assert.deepEqual(records.map(e => e.stage), expectedStages);
  assert.ok(records.every(e => e.result === 'ok'));
  assert.equal(records.find(e => e.stage === 'BEGIN').transactionActive, true);
  assert.equal(records.find(e => e.stage === 'ROLLBACK').transactionActive, false);
  assert.equal(records.at(-1).connected, false);
  assert.equal(result.trace, undefined);
  assert.deepEqual(fake.state.cleanup, ['rollback', 'close']);
});

test('SQL traza: fallo transaccional identifica etapa y mantiene limpieza y error seguro', async () => {
  const records = [], fake = fakeDriver('transaction-query', {}, 'ETIMEOUT');
  await assert.rejects(runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver,
    trace: true, onTrace: e => records.push(e) }), error => {
    assertPrivate(error); return error.code === 'SQL_QUERY_FAILED';
  });
  assertTrace(records);
  const failed = records.filter(e => e.result === 'failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].stage, 'DURING_METADATA');
  assert.equal(failed[0].technicalCode, 'ETIMEOUT');
  assert.equal(failed[0].transactionActive, true);
  assert.deepEqual(records.slice(-2).map(e => [e.stage, e.result]),
    [['CLEANUP_ROLLBACK', 'ok'], ['CLOSE', 'ok']]);
  assert.deepEqual(fake.state.cleanup, ['rollback', 'close']);
});

test('SQL traza: fallo de rollback y cierre no sustituye el error principal', async () => {
  for (const trace of [false, true]) {
    const records = [], fake = fakeDriver(['transaction-query', 'rollback', 'close']);
    await assert.rejects(runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver,
      trace, onTrace: e => records.push(e) }), error => {
      assertPrivate(error); return error.code === 'SQL_QUERY_FAILED';
    });
    assert.deepEqual(fake.state.cleanup, ['rollback', 'close']);
    if (trace) {
      assertTrace(records);
      assert.deepEqual(records.filter(e => e.result === 'failed').map(e => [e.stage, e.category]),
        [['DURING_METADATA', 'SQL_QUERY_FAILED'], ['CLEANUP_ROLLBACK', 'SQL_TRANSACTION_FAILED'],
          ['CLOSE', 'SQL_CONNECTION_FAILED']]);
    } else assert.deepEqual(records, []);
  }
});

test('SQL traza: fallo exclusivo de cierre sigue siendo fallo real', async () => {
  const records = [], fake = fakeDriver('close');
  await assert.rejects(runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver,
    trace: true, onTrace: e => records.push(e) }), { code: 'SQL_CONNECTION_FAILED' });
  assertTrace(records);
  assert.equal(records.at(-1).stage, 'CLOSE');
  assert.equal(records.at(-1).result, 'failed');
  assert.equal(fake.state.rolledBack, true);
});

test('SQL traza: codigos en lista positiva; rechaza identidades y valores arbitrarios', async () => {
  for (const [code, expected] of [['ETIMEOUT', 'ETIMEOUT'], [258, 258], ['HYT00', 'HYT00'],
    [123456789, null], [payload, null]]) {
    const records = [], fake = fakeDriver('connect', {}, code);
    await assert.rejects(runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver,
      trace: true, onTrace: e => records.push(e) }), { code: 'SQL_CONNECTION_FAILED' });
    assertTrace(records);
    assert.equal(records.find(e => e.stage === 'CONNECT').technicalCode, expected);
    assert.equal(records.at(-1).stage, 'CLOSE');
  }
});

test('SQL traza: CLI requiere --local --trace y conserva stdout separado y salida no cero', async () => {
  for (const trace of [false, true]) {
    const fake = fakeDriver();
    const output = await outputFor(options => runSqlDiagnostic({ ...options, env: {}, runtime,
      loadDriver: fake.loadDriver }), trace ? ['--local', '--trace'] : ['--local']);
    assert.equal(output.code, 0);
    assert.equal(output.stdout.length, 1);
    assert.equal(JSON.parse(output.stdout[0]).status, 'ok');
    assert.equal(output.stderr.length, trace ? expectedStages.length : 0);
    assertTrace(output.stderr.map(text => JSON.parse(text)));
  }
  const fake = fakeDriver(['transaction-query', 'rollback', 'close']);
  const failed = await outputFor(options => runSqlDiagnostic({ ...options, env: {}, runtime,
    loadDriver: fake.loadDriver }), ['--local', '--trace']);
  assert.equal(failed.code, 1);
  assert.equal(failed.stdout.length, 0);
  assert.equal(JSON.parse(failed.stderr.at(-1)).code, 'SQL_QUERY_FAILED');
  assertTrace(failed.stderr.slice(0, -1).map(text => JSON.parse(text)));
});

test('SQL traza: runtime remoto o activacion ambigua falla antes de emitir y cargar driver', async () => {
  for (const options of [{ env: { WEBSITE_INSTANCE_ID: 'synthetic' }, trace: true },
    { env: {}, trace: 'true' }]) {
    const records = [];
    await assert.rejects(runSqlDiagnostic({ runtime, ...options, onTrace: e => records.push(e),
      loadDriver: () => { assert.fail('No cargar driver'); } }), { code: 'SQL_DIAGNOSTIC_FAILED' });
    assert.deepEqual(records, []);
  }
  const output = await outputFor(() => { assert.fail('No ejecutar diagnostico'); }, ['--trace']);
  assert.equal(output.code, 1);
});

test('SQL traza: fallo del destino no expone errores ni impide rollback o cierre', async () => {
  const fake = fakeDriver();
  const result = await runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver,
    trace: true, onTrace: () => { throw rawFailure(); } });
  assert.equal(result.status, 'ok');
  assertPrivate(result);
  assert.deepEqual(fake.state.cleanup, ['rollback', 'close']);
});


test('SQL traza: evento asincrono del pool conserva codigo tecnico y se sanitiza', async () => {
  const records = [], fake = fakeDriver('event');
  await assert.rejects(runSqlDiagnostic({ env: {}, runtime, loadDriver: fake.loadDriver,
    trace: true, onTrace: e => records.push(e) }), { code: 'SQL_CONNECTION_FAILED' });
  assertTrace(records);
  const event = records.find(e => e.stage === 'POOL_EVENT');
  assert.equal(event.result, 'failed');
  assert.equal(event.category, 'SQL_CONNECTION_FAILED');
  assert.equal(event.technicalCode, 'EREQUEST');
  assert.equal(fake.state.closed, true);
});
