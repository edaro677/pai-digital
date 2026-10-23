import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalOdbcTransport } from '../.local-build/infrastructure/sql/odbc.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';
import { parseObservation, requireCompleteIdentity, sameConnection, correlationStatement,
  currentConnectionStatement, instrumentLease, assertLeaseClean, observeThenClose,
  observeAfterClose, publicObservation, residualResult, ConnectionObservationError, createObservationScope, assessResidual } from './helpers/sql-connection-observer.mjs';

const guid = '11111111-1111-4111-8111-111111111111';
const otherGuid = '22222222-2222-4222-8222-222222222222';
const secret = 'EMPRESA\\usuario.prueba usuario.prueba@ejemplo.test C:\\Privado\\usuario.prueba Password=ficticia';
const row = (overrides = {}) => ({ sessionId: 64, loginTime: '2026-10-21T16:42:05.687', connectionId: guid,
  observedAtUtc: '2026-10-22T15:00:00.123Z', status: 'running', transactionCount: 0, transactionState: 0,
  activeRequests: 1, activeUserTransactions: 0, blockedRequests: 0, waitingRequests: 0, ...overrides });
const captured = () => parseObservation(row(), 'BEGIN');
const safeError = code => error => {
  assert.equal(error.code, code); assert.equal(error.stack, undefined); assert.equal(error.cause, undefined);
  assert.ok(!JSON.stringify(error).includes(secret)); assert.ok(!JSON.stringify(error).includes(guid)); return true;
};
function fakeSql({ queryFail = false, beginCaptureFail = false, closeCaptureFail = false,
  closeFail = false, connectFail = false, constructorFail = false, residuals = [], observerSessionId = 64 } = {}) {
  const calls = [], owners = [], inputs = [];
  const contaminated = Object.assign(new Error(secret), { connectionId: guid });
  class Pool {
    constructor() { if (constructorFail) throw contaminated; this.connected = false; this.pool = {}; this.borrowed = 0; this.pending = 0; }
    on() {}
    async connect() { calls.push('connect'); if (connectFail) throw contaminated; this.connected = true; return this; }
    async close() { calls.push('close'); if (closeFail) throw contaminated; this.connected = false; this.pool = null; }
  }
  class Transaction {
    constructor(pool) { this.pool = pool; }
    async begin(level) { assert.equal(level, 4); calls.push('begin'); this.pool.borrowed = 1; }
    async rollback() { calls.push('rollback'); this.pool.borrowed = 0; }
    async commit() { calls.push('commit'); this.pool.borrowed = 0; }
  }
  class Request {
    constructor(owner) { this.owner = owner; owners.push(owner); }
    input(name, type, value) { inputs.push({ name, type, value }); return this; }
    async query(text) {
      calls.push('query');
      const inTransaction = this.owner instanceof Transaction;
      if (queryFail || (inTransaction && beginCaptureFail) || (!inTransaction && closeCaptureFail)) throw contaminated;
      if (text === currentConnectionStatement.text) return { recordset: [row({ sessionId: inTransaction ? 64 : observerSessionId, transactionCount: inTransaction ? 1 : 0,
        transactionState: inTransaction ? 1 : 0, activeUserTransactions: inTransaction ? 1 : 0 })] };
      return { recordset: residuals };
    }
  }
  return { sql: { ConnectionPool: Pool, Transaction, Request, ISOLATION_LEVEL: { SERIALIZABLE: 4 }, BigInt: 'bigint',
    UniqueIdentifier: 'guid', NVarChar: length => ({ type: 'nvarchar', length }) }, calls, owners, inputs };
}

test('SQL observer: full immutable identity, server login time distinct from UTC observation', () => {
  const c = captured(); assert.equal(c.identity.sessionId, 64); assert.equal(c.identity.connectionId, guid);
  assert.equal(c.identity.loginTime, row().loginTime); assert.equal(c.stage, 'BEGIN');
  assert.equal(c.observedAtUtc, row().observedAtUtc); assert.equal(c.connected, true);
  assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.identity));
  assert.equal(parseObservation(row({ status: 'Running' }), 'BEGIN').status, 'running');
});
test('SQL observer: optional fields absent never become invented fallback identifiers', () => {
  for (const missing of [{ connectionId: undefined }, { connectionId: null }, { loginTime: undefined }, { loginTime: null }]) {
    const c = parseObservation(row(missing), 'BEGIN');
    assert.throws(() => requireCompleteIdentity(c.identity), safeError('CONNECTION_UNIDENTIFIABLE'));
    assert.throws(() => correlationStatement(c.identity), safeError('CONNECTION_UNIDENTIFIABLE'));
  }
});
test('SQL observer: strict exact correlation includes GUID case canonicalization', () => {
  assert.equal(sameConnection(captured().identity, row({ connectionId: guid.toUpperCase() })), true);
  assert.equal(sameConnection(captured().identity, row({ sessionId: 65 })), false);
});
test('SQL observer: recycled SPID with different login is NOT the captured connection', () => {
  assert.equal(sameConnection(captured().identity, row({ loginTime: '2026-10-21T16:42:05.767' })), false);
});
test('SQL observer: recycled SPID with different physical GUID is NOT the captured connection', () => {
  assert.equal(sameConnection(captured().identity, row({ connectionId: otherGuid })), false);
});
test('SQL observer: own observer session excluded in SQL and defensive matching', () => {
  const statement = correlationStatement(captured().identity);
  assert.match(statement.text, /s\.session_id<>@@SPID/);
  assert.equal(sameConnection(captured().identity, row(), 64), false);
  assert.equal(residualResult(captured().identity, [row()], 64).records.length, 0);
});
test('SQL observer: matching program_name alone never creates a residual match', () => {
  const other = row({ program_name: 'PAI-L8C2-Transport', connectionId: otherGuid });
  assert.equal(residualResult(captured().identity, [other], 99).code, null);
  assert.doesNotMatch(correlationStatement(captured().identity).text, /program_name|host_name|login_name/);
});
test('SQL observer: SQL correlation is parameterized and no identifier interpolated in query', () => {
  const s = correlationStatement(captured().identity);
  assert.ok(!s.text.includes(guid)); assert.ok(!s.text.includes(row().loginTime));
  assert.deepEqual(s.parameters.map(p => [p.name, p.type]), [['sid', 'bigint'], ['loginTime', 'nvarchar'], ['connectionId', 'uniqueidentifier']]);
  assert.match(s.text, /c\.connection_id=@connectionId/); assert.match(s.text, /s\.login_time/);
});
test('SQL observer: visible idle connection is distinct from open transaction', () => {
  const idle = residualResult(captured().identity, [row({ status: 'sleeping', transactionState: null, activeRequests: 0 })], 99);
  assert.equal(idle.code, 'CONNECTION_STILL_VISIBLE'); assert.equal(idle.records[0].transactionCount, 0);
  const active = residualResult(captured().identity, [row({ transactionCount: 1, transactionState: null, activeUserTransactions: 1 })], 99);
  assert.equal(active.code, 'TRANSACTION_OPEN');
});
test('SQL observer: no residual and unidentifiable are different outcomes', () => {
  assert.equal(residualResult(captured().identity, [], 99).code, null);
  assert.throws(() => residualResult({ ...captured().identity, connectionId: null }, [], 99), safeError('CONNECTION_UNIDENTIFIABLE'));
});
test('SQL observer: errors and public evidence omit personal data, full GUID, SQL, stack', () => {
  const r = parseObservation(row({ host_name: secret, login_name: secret, originalError: secret }), 'BEGIN');
  const output = JSON.stringify(publicObservation(r));
  assert.ok(!output.includes(secret)); assert.ok(!output.includes(guid)); assert.ok(!output.includes('SELECT'));
  assert.match(publicObservation(r).connectionFingerprint, /^[0-9a-f]{16}$/);
  for (const bad of [row({ connectionId: secret }), row({ loginTime: secret }), row({ observedAtUtc: secret }),
    row({ status: secret }), new Proxy({}, { get() { throw new Error(secret); } })]) {
    assert.throws(() => parseObservation(bad, 'BEGIN'), safeError('OBSERVATION_FAILED'));
  }
  assert.equal(new ConnectionObservationError(secret).code, 'OBSERVATION_FAILED');
});
test('SQL observer: observation failure always closes and does not masquerade as native failure', async () => {
  const events = [], ledger = {};
  await observeThenClose(ledger, async () => { events.push('observe'); throw Error(secret); }, async () => { events.push('close'); });
  assert.deepEqual(events, ['observe', 'close']); assert.equal(ledger.nativeCloseResolved, true);
  assert.equal(ledger.nativeCloseError, undefined);
  assert.throws(() => assertLeaseClean(ledger), safeError('OBSERVATION_FAILED'));
});
test('SQL observer: native close failure remains explicit alongside observation failure', async () => {
  const ledger = {};
  await assert.rejects(observeThenClose(ledger, async () => { throw Error(secret); }, async () => { throw Error(secret); }), safeError('NATIVE_CLOSE_FAILED'));
  assert.equal(ledger.observationError.code, 'OBSERVATION_FAILED');
  assert.equal(ledger.nativeCloseResolved, undefined);
});
test('SQL observer: instrumented real port captures SAME transaction lease, rollback then pool close', async () => {
  const f = fakeSql(); const { driver, ledger } = instrumentLease(f.sql);
  await new SqlSessionRunner(new LocalOdbcTransport({ loadDriver: async () => driver })).run('rollback', async () => {});
  assertLeaseClean(ledger);
  assert.ok(f.owners[0] instanceof f.sql.Transaction); assert.equal(f.owners[0].pool, ledger.pool);
  assert.equal(ledger.begin.transactionCount, 1); assert.equal(ledger.beforeClose.transactionCount, 0);
  assert.ok(f.calls.indexOf('rollback') < f.calls.indexOf('close'));
  assert.equal(ledger.pool.connected, false); assert.equal(ledger.pool.pool, null);
});
for (const field of ['beginCaptureFail', 'closeCaptureFail']) test(`SQL observer: ${field} drains lifecycle before reporting`, async () => {
  const f = fakeSql({ [field]: true }); const { driver, ledger } = instrumentLease(f.sql);
  await new SqlSessionRunner(new LocalOdbcTransport({ loadDriver: async () => driver })).run('rollback', async () => {});
  assert.equal(ledger.nativeCloseResolved, true); assert.ok(f.calls.includes('rollback'));
  assert.throws(() => assertLeaseClean(ledger), safeError('OBSERVATION_FAILED'));
});
test('SQL observer: independent pool closes after exact parameterized observation', async () => {
  const f = fakeSql(); const result = await observeAfterClose(f.sql, {}, [{ begin: captured() }]);
  assert.equal(result.connections[0].records.length, 0); assert.equal(f.calls.at(-1), 'close');
  assert.deepEqual(f.inputs.map(p => p.name), ['sid', 'loginTime', 'connectionId']);
});
for (const field of ['queryFail', 'connectFail', 'closeFail', 'constructorFail']) test(`SQL observer: sanitized independent ${field}`, async () => {
  const f = fakeSql({ [field]: true });
  await assert.rejects(observeAfterClose(f.sql, {}, [{ begin: captured() }]), safeError(field === 'closeFail' ? 'NATIVE_CLOSE_FAILED' : 'OBSERVATION_FAILED'));
  if (field !== 'constructorFail') assert.ok(f.calls.includes('close'));
});
test('SQL observer: missing identity opens NO independent pool', async () => {
  const f = fakeSql();
  await assert.rejects(observeAfterClose(f.sql, {}, [{ begin: parseObservation(row({ connectionId: null }), 'BEGIN') }]), safeError('CONNECTION_UNIDENTIFIABLE'));
  assert.deepEqual(f.calls, []);
});
test('SQL observer: independent observation error retains secondary cleanup failure safely', async () => {
  const f = fakeSql({ queryFail: true, closeFail: true });
  await assert.rejects(observeAfterClose(f.sql, {}, [{ begin: captured() }]), error => {
    safeError('OBSERVATION_FAILED')(error);
    assert.equal(error.cleanupCode, 'NATIVE_CLOSE_FAILED'); return true;
  });
  assert.equal(f.calls.filter(c => c === 'connect').length, 1);
  assert.equal(f.calls.filter(c => c === 'close').length, 1);
});
test('SQL observer: clean-lease verdict distinguishes unidentifiable, transaction open and native failure', () => {
  const clean = { begin: captured(), beforeClose: parseObservation(row(), 'BEFORE_CLOSE'),
    nativeCloseResolved: true, observationError: null, borrowedBeforeClose: 0, pendingBeforeClose: 0 };
  assert.doesNotThrow(() => assertLeaseClean(clean));
  assert.throws(() => assertLeaseClean({ ...clean, beforeClose: parseObservation(row({ connectionId: otherGuid }), 'BEFORE_CLOSE') }), safeError('CONNECTION_UNIDENTIFIABLE'));
  assert.throws(() => assertLeaseClean({ ...clean, beforeClose: parseObservation(row({ transactionCount: 1, transactionState: 1 }), 'BEFORE_CLOSE') }), safeError('TRANSACTION_OPEN'));
  assert.throws(() => assertLeaseClean({ ...clean, nativeCloseResolved: false }), safeError('NATIVE_CLOSE_FAILED'));
});
test('SQL observer: versioned integration stays opt-in and covers all three leases without broad criterion', async () => {
  const source = await readFile(new URL('./integration/sql-transport.test.mjs', import.meta.url), 'utf8');
  assert.match(source, /skip: process\.env\.PAI_SQL_TRANSPORT_INTEGRATION !== '1'/);
  assert.match(source, /instrumentLease\(sql, \{ requestType: CountingRequest, scope: identityScope \}\)/);
  assert.match(source, /leases\.push\(instrumented\.ledger\)/);
  assert.match(source, /observeAfterClose\(sql, observerConfig, leases, identityScope\)/);
  assert.match(source, /finally\s*\{[\s\S]*identityScope\.dispose\(\)/);
  assert.doesNotMatch(source, /program_name=N'PAI-L8C2-Transport'/);
});

// R11-B: synthetic identities only. No native driver, SQL connection or disk evidence.
async function scopedLease(scope) {
  const f = fakeSql(); const instrumented = instrumentLease(f.sql, { scope });
  await new SqlSessionRunner(new LocalOdbcTransport({ loadDriver: async () => instrumented.driver })).run('rollback', async () => {});
  assertLeaseClean(instrumented.ledger);
  return { ...f, ...instrumented };
}
test('R11-B: full identity survives native close in process-local scope', async () => {
  const scope = createObservationScope();
  try {
    const { ledger } = await scopedLease(scope);
    assert.equal(ledger.pool.connected, false); assert.equal(ledger.nativeCloseResolved, true);
    assert.equal(ledger.begin.identity.connectionId, guid);
    assert.equal(ledger.beforeClose.identity.connectionId, guid);
    assert.equal(scope.active, true); assert.equal(scope.retainedCount, 2);
  } finally { scope.dispose(); }
});
test('R11-B: post-close correlation binds complete GUID, login time and SID, never fingerprint', async () => {
  const scope = createObservationScope();
  try {
    const { ledger } = await scopedLease(scope); const observer = fakeSql({ observerSessionId: 99 });
    const result = await observeAfterClose(observer.sql, {}, [ledger], scope);
    assert.equal(observer.inputs.find(p => p.name === 'connectionId').value, guid);
    assert.equal(observer.inputs.find(p => p.name === 'loginTime').value, row().loginTime);
    assert.equal(observer.inputs.find(p => p.name === 'sid').value, '64');
    assert.equal(result.connections[0].code, null);
    assert.equal(result.connections[0].captured.identity.connectionId, guid);
  } finally { scope.dispose(); }
});
for (const [label,overrides] of [['reused SID, new login', { loginTime: '2026-10-21T16:42:05.767' }],
  ['same SID/login, different connection ID', { connectionId: otherGuid }]]) {
  test(`R11-B: scoped correlation rejects partial match: ${label}`, async () => {
    const scope = createObservationScope();
    try {
      const { ledger } = await scopedLease(scope);
      const observer = fakeSql({ observerSessionId: 99, residuals: [row(overrides)] });
      const result = await observeAfterClose(observer.sql, {}, [ledger], scope);
      assert.equal(result.connections[0].records.length, 0);
    } finally { scope.dispose(); }
  });
}
test('R11-B: incomplete scoped identity fails without opening independent pool', async () => {
  const scope = createObservationScope(), observer = fakeSql();
  const ledger = { begin: parseObservation(row({ connectionId: null }), 'BEGIN'),
    beforeClose: parseObservation(row({ connectionId: null }), 'BEFORE_CLOSE'),
    nativeCloseResolved: true, observationError: null, borrowedBeforeClose: 0, pendingBeforeClose: 0 };
  try {
    await assert.rejects(observeAfterClose(observer.sql, {}, [ledger], scope), safeError('CONNECTION_UNIDENTIFIABLE'));
    assert.deepEqual(observer.calls, []);
  } finally { scope.dispose(); }
});
test('R11-B: dispose revokes retained identity handles and drops ledger references', async () => {
  const scope = createObservationScope(); const { ledger, driver } = await scopedLease(scope);
  const retained = ledger.begin, id = retained.identity;
  assert.equal(id.connectionId, guid); scope.dispose(); scope.dispose();
  assert.equal(scope.active, false); assert.equal(scope.retainedCount, 0);
  assert.equal(ledger.begin, null); assert.equal(ledger.beforeClose, null); assert.equal(ledger.pool, null);
  assert.equal(id.connectionId, null); assert.equal(retained.identity.connectionId, null);
  assert.throws(() => requireCompleteIdentity(id), safeError('CONNECTION_UNIDENTIFIABLE'));
  assert.throws(() => new driver.ConnectionPool({}), safeError('CONNECTION_UNIDENTIFIABLE'));
  const observer = fakeSql();
  await assert.rejects(observeAfterClose(observer.sql, {}, [ledger], scope), safeError('CONNECTION_UNIDENTIFIABLE'));
  assert.deepEqual(observer.calls, []);
});
test('R11-B: full GUID never appears in default JSON or public log projections', async () => {
  const scope = createObservationScope();
  try {
    const { ledger } = await scopedLease(scope), observer = fakeSql({ observerSessionId: 99, residuals: [row({ status: 'sleeping' })] });
    const result = await observeAfterClose(observer.sql, {}, [ledger], scope);
    const logs = [publicObservation(ledger.begin), publicObservation(result.observer), ...result.connections[0].records.map(publicObservation)];
    for (const value of [scope, ledger, ledger.begin, ledger.begin.identity, result, logs, new ConnectionObservationError('CONNECTION_STILL_VISIBLE')]) {
      const json = JSON.stringify(value); assert.ok(!json.includes(guid)); assert.ok(!json.includes(otherGuid)); assert.ok(!json.includes(secret));
    }
    assert.equal(ledger.begin.identity.connectionId, guid);
    assert.match(logs[0].connectionFingerprint, /^[0-9a-f]{16}$/);
  } finally { scope.dispose(); }
});
for (const [label,overrides,expected] of [
  ['visible idle residual', { status: 'sleeping', transactionState: null, activeRequests: 0 }, 'CONNECTION_STILL_VISIBLE'],
  ['visible transaction', { transactionCount: 1, transactionState: null, activeUserTransactions: 1 }, 'TRANSACTION_OPEN']]) {
  test(`R11-B: ${label} retains its diagnostic classification`, async () => {
    const scope = createObservationScope();
    try {
      const { ledger } = await scopedLease(scope), observer = fakeSql({ observerSessionId: 99, residuals: [row(overrides)] });
      const result = await observeAfterClose(observer.sql, {}, [ledger], scope);
      assert.equal(result.connections[0].code, expected);
      assert.throws(() => { if (result.connections[0].code) throw new ConnectionObservationError(result.connections[0].code); }, safeError(expected));
    } finally { scope.dispose(); }
  });
}
test('R11-B: observer failure closes observer, remains sanitized and disposes scope in finally', async () => {
  const scope = createObservationScope(); const { ledger } = await scopedLease(scope); const id = ledger.begin.identity;
  const observer = fakeSql({ queryFail: true });
  try {
    await assert.rejects(observeAfterClose(observer.sql, {}, [ledger], scope), safeError('OBSERVATION_FAILED'));
  } finally { scope.dispose(); }
  assert.equal(observer.calls.at(-1), 'close'); assert.equal(id.connectionId, null);
  assert.equal(scope.retainedCount, 0); assert.equal(ledger.pool, null);
});

function idleResidual(overrides = {}) {
  const record = parseObservation(row({ status: 'sleeping', transactionCount: 0,
    transactionState: null, activeUserTransactions: 0, activeRequests: 0,
    blockedRequests: 0, waitingRequests: 0, ...overrides }), 'POST_CLOSE');
  return { captured: captured(), records: [record], code: 'CONNECTION_STILL_VISIBLE' };
}
test('PoC: exactly correlated idle connection is a warning, not a close error', () => {
  assert.equal(assessResidual(idleResidual()), 'CONNECTION_STILL_VISIBLE');
});
test('PoC: no residual connection is accepted', () => {
  assert.equal(assessResidual({ captured: captured(), records: [], code: null }), null);
});
for (const [field, value, expected] of [
  ['status', 'running', 'OBSERVATION_FAILED'],
  ['activeRequests', 1, 'OBSERVATION_FAILED'],
  ['blockedRequests', 1, 'OBSERVATION_FAILED'],
  ['waitingRequests', 1, 'OBSERVATION_FAILED'],
  ['transactionCount', 1, 'TRANSACTION_OPEN'],
  ['activeUserTransactions', 1, 'TRANSACTION_OPEN'],
  ['transactionState', -1, 'TRANSACTION_OPEN'],
  ['connectionId', null, 'CONNECTION_UNIDENTIFIABLE'],
  ['connectionId', otherGuid, 'CONNECTION_UNIDENTIFIABLE'],
]) {
  test(`PoC: residual ${field}=${value === otherGuid ? 'different' : value} blocks acceptance`, () => {
    assert.throws(() => assessResidual(idleResidual({ [field]: value })), safeError(expected));
  });
}
test('PoC: incomplete captured identity, contradictory and failed observations block', () => {
  const incomplete = idleResidual();
  incomplete.captured = parseObservation(row({ connectionId: null }), 'BEGIN');
  assert.throws(() => assessResidual(incomplete), safeError('CONNECTION_UNIDENTIFIABLE'));
  assert.throws(() => assessResidual({ ...idleResidual(), code: null }), safeError('OBSERVATION_FAILED'));
  assert.throws(() => assessResidual({ ...idleResidual(), code: 'OBSERVATION_FAILED' }), safeError('OBSERVATION_FAILED'));
  assert.throws(() => assessResidual({ ...idleResidual(), code: 'TRANSACTION_OPEN' }), safeError('TRANSACTION_OPEN'));
});
test('R11-B: disposal cannot race an awaited post-close observation', async () => {
  const scope = createObservationScope(); const { ledger } = await scopedLease(scope), observer = fakeSql({ observerSessionId: 99 });
  const pending = observeAfterClose(observer.sql, {}, [ledger], scope);
  assert.throws(() => scope.dispose(), safeError('OBSERVATION_FAILED'));
  assert.equal(ledger.begin.identity.connectionId, guid);
  try { await pending; } finally { scope.dispose(); }
  assert.equal(scope.active, false);
});
