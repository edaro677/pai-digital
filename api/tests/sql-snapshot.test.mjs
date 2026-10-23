import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSqlcmdSnapshot, withFinalSnapshot } from './helpers/sql-snapshot.mjs';
import { SqlInfrastructureError } from '../.local-build/infrastructure/sql/errors.js';
import { ConnectionObservationError } from './helpers/sql-connection-observer.mjs';

const secrets = ['EMPRESA\\usuario.prueba', 'usuario.prueba@ejemplo.test',
  'C:\\Privado\\usuario.prueba', 'Server=ficticio;Password=secreto-sintetico;',
  '11111111-1111-4111-8111-111111111111'];
const contaminated = secrets.join(' ');
const fields = ['stage', 'durationMs', 'exitCode', 'signal', 'technicalCode',
  'stdoutReceived', 'stderrReceived', 'parseReached', 'parseSucceeded', 'category'];
function safeEvidence(record) {
  assert.deepEqual(Object.keys(record).sort(), [...fields].sort());
  assert.equal(Object.isFrozen(record), true);
  assert.ok(Number.isFinite(record.durationMs) && record.durationMs >= 0);
  for (const secret of secrets) assert.equal(JSON.stringify(record).includes(secret), false);
}
function failure(error) {
  let calls = 0, publicError;
  const records = [];
  try { parseSqlcmdSnapshot(() => { calls++; throw error; }, r => records.push(r)); }
  catch (caught) { publicError = caught; }
  assert.equal(calls, 1);
  assert.equal(publicError?.code, 'SQL_QUERY_FAILED');
  assert.equal(publicError.stack, undefined);
  assert.equal(publicError.cause, undefined);
  assert.equal(publicError.originalError, undefined);
  for (const secret of secrets) {
    assert.equal(JSON.stringify(publicError).includes(secret), false);
    assert.equal(String(publicError).includes(secret), false);
  }
  assert.equal(records.length, 1);
  safeEvidence(records[0]);
  assert.equal(records[0].stage, 'PROCESS');
  assert.equal(records[0].parseReached, false);
  assert.equal(records[0].parseSucceeded, false);
  return records[0];
}

for (const code of ['ENOENT', 'EACCES', 'ENOEXEC']) {
  test(`snapshot: arranque rechazado ${code}`, () => {
    const r = failure(Object.assign(new Error(contaminated), { code }));
    assert.equal(r.category, 'SQLCMD_SPAWN_FAILED');
    assert.equal(r.technicalCode, code);
    assert.equal(r.exitCode, null);
  });
}
test('snapshot: exitCode no satisfactorio no implica fallo de conexión', () => {
  const r = failure(Object.assign(new Error(contaminated), { status: 1,
    stdout: contaminated, stderr: Buffer.from(contaminated), code: contaminated }));
  assert.equal(r.category, 'SQLCMD_PROCESS_FAILED');
  assert.equal(r.exitCode, 1);
  assert.equal(r.technicalCode, null);
  assert.equal(r.stdoutReceived, true);
  assert.equal(r.stderrReceived, true);
});
test('snapshot: timeout conserva categoría aunque haya señal', () => {
  const r = failure({ code: 'ETIMEDOUT', status: null, signal: 'SIGTERM' });
  assert.equal(r.category, 'SQLCMD_PROCESS_TIMEOUT');
  assert.equal(r.technicalCode, 'ETIMEDOUT');
  assert.equal(r.signal, 'SIGTERM');
});
test('snapshot: terminación por señal permitida', () => {
  const r = failure({ signal: 'SIGKILL', status: null });
  assert.equal(r.category, 'SQLCMD_PROCESS_FAILED');
  assert.equal(r.signal, 'SIGKILL');
});
test('snapshot: exceso de buffer no se confunde con parseo', () => {
  const r = failure({ code: 'ENOBUFS', stdout: '', stderr: Buffer.alloc(0) });
  assert.equal(r.category, 'SQLCMD_OUTPUT_FAILED');
  assert.equal(r.stdoutReceived, false);
  assert.equal(r.stderrReceived, false);
});
for (const thrown of [undefined, null, {}, contaminated]) {
  test(`snapshot: diagnóstico insuficiente (${typeof thrown})`, () => {
    const r = failure(thrown);
    assert.equal(r.category, 'SQLCMD_DIAGNOSTIC_UNKNOWN');
    assert.equal(r.stdoutReceived, null);
    assert.equal(r.stderrReceived, null);
  });
}
test('snapshot: propiedades desconocidas y señales no permitidas se excluyen', () => {
  const r = failure({ code: contaminated, signal: contaminated, status: contaminated,
    message: contaminated, stack: contaminated, connectionId: contaminated });
  assert.equal(r.category, 'SQLCMD_DIAGNOSTIC_UNKNOWN');
  assert.equal(r.technicalCode, null);
  assert.equal(r.signal, null);
  assert.equal(r.exitCode, null);
});
test('snapshot: no invoca getters de excepciones', () => {
  const error = {};
  for (const key of ['code', 'status', 'signal', 'stdout', 'stderr', 'pid']) {
    Object.defineProperty(error, key, { get() { throw new Error(contaminated); } });
  }
  assert.equal(failure(error).category, 'SQLCMD_DIAGNOSTIC_UNKNOWN');
});
for (const text of ['', '   ', contaminated, '{"incomplete":']) {
  test(`snapshot: JSON inválido o vacío (${text.length} caracteres)`, () => {
    const records = [];
    assert.throws(() => parseSqlcmdSnapshot(() => text, r => records.push(r)), error => {
      assert.equal(error.code, 'SQL_QUERY_FAILED');
      assert.equal(error.stack, undefined);
      assert.equal(error.cause, undefined);
      assert.equal(String(error).includes(contaminated), false);
      return true;
    });
    assert.equal(records.length, 1);
    safeEvidence(records[0]);
    assert.equal(records[0].stage, 'JSON');
    assert.equal(records[0].category, 'SQLCMD_JSON_INVALID');
    assert.equal(records[0].exitCode, 0);
    assert.equal(records[0].parseReached, true);
    assert.equal(records[0].parseSucceeded, false);
    assert.equal(records[0].stderrReceived, null);
  });
}
test('snapshot: JSON válido retorna exactamente los datos, sin publicarlos', () => {
  const records = [], value = { state: 'ONLINE', rows: 0, private: contaminated };
  assert.deepEqual(parseSqlcmdSnapshot(() => '  ' + JSON.stringify(value) + '\n', r => records.push(r)), value);
  assert.equal(records.length, 1);
  safeEvidence(records[0]);
  assert.equal(records[0].parseReached, true);
  assert.equal(records[0].parseSucceeded, true);
  assert.equal(records[0].category, null);
  assert.equal(records[0].stdoutReceived, true);
  assert.equal(records[0].stderrReceived, null);
});
test('snapshot: observador fallido no altera retorno ni error público', () => {
  const sink = () => { throw new Error(contaminated); };
  assert.deepEqual(parseSqlcmdSnapshot(() => '{}', sink), {});
  assert.throws(() => parseSqlcmdSnapshot(() => { throw { status: 1 }; }, sink),
    e => e.code === 'SQL_QUERY_FAILED' && e.stack === undefined);
  assert.throws(() => parseSqlcmdSnapshot(() => 'invalid', sink),
    e => e.code === 'SQL_QUERY_FAILED' && e.stack === undefined);
});
test('snapshot: no escribe en stdout/stderr ni conserva errores crudos', () => {
  const originalLog = console.log, originalError = console.error;
  const output = [];
  try {
    console.log = (...args) => output.push(args);
    console.error = (...args) => output.push(args);
    failure(Object.assign(new Error(contaminated), { status: 1, stdout: contaminated, stderr: contaminated }));
    const records = [];
    parseSqlcmdSnapshot(() => JSON.stringify({ private: contaminated }), r => records.push(r));
    assert.equal(output.length, 0);
    safeEvidence(records[0]);
  } finally { console.log = originalLog; console.error = originalError; }
});
test('snapshot: helper no incorpora ejecutores SQL ni dependencias de producción', () => {
  const helper = readFileSync(new URL('./helpers/sql-snapshot.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /from ['"](?:node:child_process|mssql|msnodesqlv8)/);
  const integration = readFileSync(new URL('./integration/sql-transport.test.mjs', import.meta.url), 'utf8');
  assert.ok(integration.includes("['-S', 'lpc:.\\\\PAIPOC', '-E', '-d', 'pai_poc_dev', '-l', '5', '-t', '5', '-b', '-y', '0', '-w', '65535', '-Q', snapshotSql]"));
  assert.ok(integration.includes("{ encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }"));
  assert.ok(integration.includes("C:\\\\Program Files\\\\Microsoft SQL Server\\\\Client SDK\\\\ODBC\\\\170\\\\Tools\\\\Binn\\\\SQLCMD.EXE"));
  assert.ok(integration.includes('assert.deepEqual(after, before,'));
  assert.ok(integration.includes('identityScope.dispose();'));
});

test('final snapshot: runs once after awaited cleanup and permits an idle warning', async () => {
  const order = [], evidence = [];
  const result = await withFinalSnapshot(async () => {
    order.push('work'); await Promise.resolve(); order.push('cleanup');
    return { warning: 'CONNECTION_STILL_VISIBLE' };
  }, () => { order.push('snapshot'); }, r => evidence.push(r));
  assert.deepEqual(order, ['work', 'cleanup', 'snapshot']);
  assert.equal(result.warning, 'CONNECTION_STILL_VISIBLE');
  assert.deepEqual(evidence, [{ finalIntegrityVerified: true, priorFailureCode: null, finalFailureCode: null }]);
});
for (const code of ['SQL_QUERY_FAILED', 'SQL_ROLLBACK_FAILED', 'SQL_CLOSE_FAILED', 'SQL_SESSION_PENDING']) {
  test(`final snapshot: successful verification never hides ${code}`, async () => {
    let calls = 0; const evidence = [];
    await assert.rejects(withFinalSnapshot(async () => { throw new SqlInfrastructureError(code); },
      () => { calls++; }, r => evidence.push(r)), e => e.code === code && e.stack === undefined);
    assert.equal(calls, 1);
    assert.equal(evidence[0].finalIntegrityVerified, true);
    assert.equal(evidence[0].priorFailureCode, code);
  });
}
for (const code of ['TRANSACTION_OPEN', 'NATIVE_CLOSE_FAILED', 'OBSERVATION_FAILED', 'CONNECTION_UNIDENTIFIABLE']) {
  test(`final snapshot: verification is attempted after ${code}`, async () => {
    let calls = 0;
    await assert.rejects(withFinalSnapshot(async () => { throw new ConnectionObservationError(code); },
      () => { calls++; }), e => e.code === code && e.stack === undefined);
    assert.equal(calls, 1);
  });
}
test('final snapshot: failure after a warning blocks success and marks integrity unverified', async () => {
  const evidence = [];
  await assert.rejects(withFinalSnapshot(async () => ({ warning: 'CONNECTION_STILL_VISIBLE' }),
    () => { throw new SqlInfrastructureError('SQL_QUERY_FAILED'); }, r => evidence.push(r)),
  e => e.code === 'SQL_QUERY_FAILED');
  assert.deepEqual(evidence, [{ finalIntegrityVerified: false, priorFailureCode: null, finalFailureCode: 'SQL_QUERY_FAILED' }]);
});
test('final snapshot: independent primary, cleanup and final errors are preserved safely', async () => {
  const evidence = [];
  const primary = new ConnectionObservationError('OBSERVATION_FAILED');
  primary.cleanupCode = 'NATIVE_CLOSE_FAILED'; primary.private = contaminated;
  await assert.rejects(withFinalSnapshot(async () => { throw primary; }, () => {
    throw new SqlInfrastructureError('SQL_QUERY_FAILED');
  }, r => evidence.push(r)), error => {
    assert.equal(error.code, 'OBSERVATION_FAILED');
    assert.equal(error.cleanupCode, 'NATIVE_CLOSE_FAILED');
    assert.equal(error.finalSnapshotCode, 'SQL_QUERY_FAILED');
    assert.equal(error.stack, undefined); assert.equal(error.cause, undefined);
    for (const secret of secrets) assert.equal(JSON.stringify(error).includes(secret), false);
    return true;
  });
  assert.equal(evidence[0].finalIntegrityVerified, false);
  assert.equal(evidence[0].priorFailureCode, 'OBSERVATION_FAILED');
  assert.equal(evidence[0].finalFailureCode, 'SQL_QUERY_FAILED');
});
test('final snapshot: integrity assertion failure remains blocking and sanitized', async () => {
  const evidence = [];
  await assert.rejects(withFinalSnapshot(async () => {}, () => { throw new Error(contaminated); },
    r => evidence.push(r)), e => e.code === 'SQL_WORK_FAILED' && !String(e).includes(contaminated));
  assert.equal(evidence[0].finalIntegrityVerified, false);
});
