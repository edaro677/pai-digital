// Test-only instrumentation. No native import, HTTP, retry, delay or SQL writes.
import { createHash } from 'node:crypto';
import { prepareMssqlOdbcParameters, validateSqlStatement } from '../../.local-build/infrastructure/sql/parameters.js';

const codes = ['OBSERVATION_FAILED', 'CONNECTION_UNIDENTIFIABLE', 'CONNECTION_STILL_VISIBLE',
  'TRANSACTION_OPEN', 'NATIVE_CLOSE_FAILED'];
export class ConnectionObservationError extends Error {
  constructor(code) {
    super('La comprobacion tecnica de conexiones SQL no pudo completarse.');
    this.name = 'ConnectionObservationError';
    this.code = codes.includes(code) ? code : 'OBSERVATION_FAILED';
    delete this.stack;
  }
}
const fail = code => { throw new ConnectionObservationError(code); };
const integer = n => Number.isInteger(n) && n >= 0;
// Raw connection IDs never become enumerable properties or public evidence.
// WeakMap keys and the scope are process-local; dispose revokes retained handles.
const identityValues = new WeakMap();
const observationScopes = new WeakMap();
function scopeState(scope) {
  const state = observationScopes.get(scope);
  if (!state?.active) fail('CONNECTION_UNIDENTIFIABLE');
  return state;
}
function retainRecord(scope, record) {
  if (scope) scopeState(scope).records.add(record);
  return record;
}
function retainLedger(scope, ledger) {
  if (scope) {
    const state = scopeState(scope);
    state.ledgers.add(ledger);
    for (const record of [ledger.begin, ledger.beforeClose]) if (record) state.records.add(record);
  }
}
export function createObservationScope() {
  const state = { active: true, busy: 0, records: new Set(), ledgers: new Set() };
  const scope = Object.freeze({
    get active() { return state.active; },
    get retainedCount() { return state.records.size; },
    dispose() {
      if (!state.active) return;
      // Do not discard keys while an awaited DMV correlation is still using them.
      if (state.busy) fail('OBSERVATION_FAILED');
      for (const record of state.records) identityValues.delete(record.identity);
      for (const ledger of state.ledgers) {
        ledger.begin = null; ledger.beforeClose = null; ledger.pool = null;
      }
      state.records.clear(); state.ledgers.clear(); state.active = false;
    },
  });
  observationScopes.set(scope, state);
  return scope;
}
function loginTime(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?$/.test(value)) fail('OBSERVATION_FAILED');
  // Calendar validation only. login_time is SERVER LOCAL time, not asserted UTC.
  const iso = value.includes('.') ? value + 'Z' : value + '.000Z';
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString() !== iso) fail('OBSERVATION_FAILED');
  return value;
}
function identity(input) {
  const { sessionId, connectionId } = input;
  if (!Number.isInteger(sessionId) || sessionId < 1 || sessionId > 32767) fail('OBSERVATION_FAILED');
  const id = connectionId === undefined || connectionId === null ? null : connectionId;
  if (id !== null && (typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
      || /^0{8}(-0{4}){3}-0{12}$/.test(id))) fail('OBSERVATION_FAILED');
  const handle = { sessionId, loginTime: loginTime(input.loginTime) };
  identityValues.set(handle, id?.toLowerCase() ?? null);
  Object.defineProperty(handle, 'connectionId', { enumerable: false,
    get() { return identityValues.get(handle) ?? null; } });
  return Object.freeze(handle);
}
export function parseObservation(row, stage) {
  try {
    if (!['BEGIN', 'BEFORE_CLOSE', 'OBSERVER', 'POST_CLOSE'].includes(stage)) fail('OBSERVATION_FAILED');
    const id = identity(row);
    if (typeof row.observedAtUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.observedAtUtc)
        || new Date(row.observedAtUtc).toISOString() !== row.observedAtUtc) fail('OBSERVATION_FAILED');
    for (const field of ['transactionCount', 'activeRequests', 'activeUserTransactions', 'blockedRequests', 'waitingRequests']) {
      if (!integer(row[field])) fail('OBSERVATION_FAILED');
    }
    if (![null, -1, 0, 1].includes(row.transactionState)) fail('OBSERVATION_FAILED');
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : null;
    if (!['running', 'sleeping', 'dormant', 'preconnect'].includes(status)) fail('OBSERVATION_FAILED');
    return Object.freeze({ identity: id, stage, connected: stage === 'POST_CLOSE' ? (id.connectionId ? true : null) : true,
      observedAtUtc: row.observedAtUtc, status, transactionCount: row.transactionCount,
      transactionState: row.transactionState, activeRequests: row.activeRequests,
      activeUserTransactions: row.activeUserTransactions, blockedRequests: row.blockedRequests, waitingRequests: row.waitingRequests });
  } catch { return fail('OBSERVATION_FAILED'); }
}
export function requireCompleteIdentity(input) {
  try {
    const id = identity(input);
    if (id.loginTime === null || id.connectionId === null) fail('CONNECTION_UNIDENTIFIABLE');
    return id;
  } catch { return fail('CONNECTION_UNIDENTIFIABLE'); }
}
export function sameConnection(left, right, observerSessionId = null) {
  try {
    const a = requireCompleteIdentity(left), b = requireCompleteIdentity(right);
    return b.sessionId !== observerSessionId && a.sessionId === b.sessionId
      && a.loginTime === b.loginTime && a.connectionId === b.connectionId;
  } catch { return false; }
}
const fields = `s.session_id AS sessionId, CONVERT(varchar(33),s.login_time,126) AS loginTime,
 CONVERT(varchar(36),c.connection_id) AS connectionId, s.status AS status,
 CONVERT(varchar(23),CAST(SYSUTCDATETIME() AS datetime2(3)),126)+'Z' AS observedAtUtc,
 (SELECT COUNT(*) FROM sys.dm_exec_requests r WHERE r.session_id=s.session_id) AS activeRequests,
 (SELECT COUNT(*) FROM sys.dm_tran_session_transactions t WHERE t.session_id=s.session_id AND t.is_user_transaction=1) AS activeUserTransactions,
 (SELECT COUNT(*) FROM sys.dm_exec_requests r WHERE r.session_id=s.session_id AND r.blocking_session_id>0) AS blockedRequests,
 (SELECT COUNT(*) FROM sys.dm_exec_requests r WHERE r.session_id=s.session_id AND r.wait_type IS NOT NULL) AS waitingRequests`;
const source = `FROM sys.dm_exec_sessions s LEFT JOIN sys.dm_exec_connections c
 ON c.session_id=s.session_id AND c.parent_connection_id IS NULL`;
export const currentConnectionStatement = Object.freeze({ text: `DECLARE @Count int=@@TRANCOUNT,@State smallint=XACT_STATE();
 SELECT ${fields},@Count AS transactionCount,@State AS transactionState ${source} WHERE s.session_id=@@SPID;`, parameters: Object.freeze([]) });
export function correlationStatement(input) {
  const id = requireCompleteIdentity(input);
  return { text: `SELECT ${fields},s.open_transaction_count AS transactionCount,
 CAST(NULL AS smallint) AS transactionState ${source}
 WHERE s.session_id<>@@SPID AND s.session_id=@sid
 AND CONVERT(varchar(33),s.login_time,126) COLLATE Latin1_General_100_BIN2=@loginTime COLLATE Latin1_General_100_BIN2
 AND c.connection_id=@connectionId;`, parameters: [
    { name: 'sid', type: 'bigint', value: String(id.sessionId) },
    { name: 'loginTime', type: 'nvarchar', length: 33, value: id.loginTime },
    { name: 'connectionId', type: 'uniqueidentifier', value: id.connectionId },
  ] };
}
// Explicit types and the same R1/R4 preparation barrier, including observer reads.
export async function readDiagnostic(sql, owner, input) {
  try {
    const statement = validateSqlStatement(input);
    const parameters = prepareMssqlOdbcParameters(statement.parameters);
    const bindings = parameters.map(p => {
      const type = p.type === 'bigint' ? sql.BigInt : p.type === 'nvarchar' ? sql.NVarChar(p.length)
        : p.type === 'uniqueidentifier' ? sql.UniqueIdentifier : fail('OBSERVATION_FAILED');
      return { name: p.name, value: p.value, type };
    });
    const request = new sql.Request(owner);
    for (const p of bindings) request.input(p.name, p.type, p.value);
    const result = await request.query(statement.text);
    if (!Array.isArray(result.recordset)) fail('OBSERVATION_FAILED');
    return result.recordset;
  } catch { return fail('OBSERVATION_FAILED'); }
}
async function capture(sql, owner, stage) {
  const rows = await readDiagnostic(sql, owner, currentConnectionStatement);
  if (rows.length !== 1) fail('CONNECTION_UNIDENTIFIABLE');
  return parseObservation(rows[0], stage);
}
/** Observer errors are retained separately. Only native close errors reject close.
 * Observation uses the existing max=1 pool, never a fresh diagnostic connection. */
export async function observeThenClose(ledger, observe, close) {
  try { ledger.beforeClose = await observe(); }
  catch { ledger.observationError ??= new ConnectionObservationError('OBSERVATION_FAILED'); }
  finally {
    ledger.nativeCloseInvoked = true;
    try { await close(); ledger.nativeCloseResolved = true; }
    catch { ledger.nativeCloseError = new ConnectionObservationError('NATIVE_CLOSE_FAILED'); throw ledger.nativeCloseError; }
  }
}
export function instrumentLease(sql, { requestType = sql.Request, scope } = {}) {
  const ledger = { begin: null, beforeClose: null, observationError: null,
    nativeCloseInvoked: false, nativeCloseResolved: false, nativeCloseError: null,
    borrowedBeforeClose: null, pendingBeforeClose: null, pool: null };
  retainLedger(scope, ledger);
  Object.defineProperty(ledger, 'toJSON', { value: () => ({
    begin: ledger.begin ? publicObservation(ledger.begin) : null,
    beforeClose: ledger.beforeClose ? publicObservation(ledger.beforeClose) : null,
    nativeCloseInvoked: ledger.nativeCloseInvoked, nativeCloseResolved: ledger.nativeCloseResolved,
  }) });
  class Pool extends sql.ConnectionPool {
    constructor(config) { if (scope) scopeState(scope); super(config); ledger.pool = this; }
    async close() {
      await observeThenClose(ledger, async () => {
        if (!this.connected) fail('OBSERVATION_FAILED');
        ledger.borrowedBeforeClose = this.borrowed; ledger.pendingBeforeClose = this.pending;
        return retainRecord(scope, await capture(sql, this, 'BEFORE_CLOSE'));
      }, () => super.close());
    }
  }
  class Transaction extends sql.Transaction {
    async begin(level) {
      if (scope) scopeState(scope);
      await super.begin(level);
      // Real transaction lease, not the independent post-close observer.
      try { ledger.begin = retainRecord(scope, await capture(sql, this, 'BEGIN')); }
      catch { ledger.observationError ??= new ConnectionObservationError('OBSERVATION_FAILED'); }
      return this;
    }
  }
  return { ledger, driver: { ...sql, ConnectionPool: Pool, Transaction, Request: requestType } };
}
export function assertLeaseClean(ledger) {
  if (ledger.nativeCloseError || !ledger.nativeCloseResolved) fail('NATIVE_CLOSE_FAILED');
  if (ledger.observationError) fail('OBSERVATION_FAILED');
  if (!ledger.begin || !ledger.beforeClose || !sameConnection(ledger.begin.identity, ledger.beforeClose.identity)) fail('CONNECTION_UNIDENTIFIABLE');
  if (ledger.beforeClose.transactionCount !== 0 || ledger.beforeClose.transactionState !== 0
      || ledger.beforeClose.activeUserTransactions > 0) fail('TRANSACTION_OPEN');
  if (ledger.borrowedBeforeClose !== 0 || ledger.pendingBeforeClose !== 0) fail('OBSERVATION_FAILED');
}
export function publicObservation(record) {
  // Reparse: no spread of caller/driver data into the diagnostic output.
  const r = parseObservation({ ...record, sessionId: record.identity.sessionId,
    loginTime: record.identity.loginTime, connectionId: record.identity.connectionId }, record.stage);
  return { sessionId: r.identity.sessionId, loginTime: r.identity.loginTime,
    connectionFingerprint: r.identity.connectionId ? createHash('sha256').update(r.identity.connectionId).digest('hex').slice(0, 16) : null,
    stage: r.stage, connected: r.connected, observedAtUtc: r.observedAtUtc, status: r.status,
    transactionCount: r.transactionCount, transactionState: r.transactionState,
    activeRequests: r.activeRequests, activeUserTransactions: r.activeUserTransactions,
    blockedRequests: r.blockedRequests, waitingRequests: r.waitingRequests };
}
export function residualResult(captured, rows, observerSessionId) {
  requireCompleteIdentity(captured);
  const records = rows.map(r => parseObservation(r, 'POST_CLOSE'))
    .filter(r => sameConnection(captured, r.identity, observerSessionId));
  return { records, code: records.some(r => r.transactionCount > 0 || r.activeUserTransactions > 0)
    ? 'TRANSACTION_OPEN' : records.length ? 'CONNECTION_STILL_VISIBLE' : null };
}
// PoC acceptance: physical visibility alone is not a logical-close failure.
// Capture/correlation and native-close checks remain mandatory upstream.
export function assessResidual(result) {
  requireCompleteIdentity(result.captured.identity);
  if (!Array.isArray(result.records)) fail('OBSERVATION_FAILED');
  if (result.code === null && result.records.length === 0) return null;
  if (result.code === 'TRANSACTION_OPEN') fail('TRANSACTION_OPEN');
  if (result.code !== 'CONNECTION_STILL_VISIBLE' || !result.records.length) fail('OBSERVATION_FAILED');
  for (const record of result.records) {
    requireCompleteIdentity(record.identity);
    if (!sameConnection(result.captured.identity, record.identity)) fail('CONNECTION_UNIDENTIFIABLE');
    if (record.transactionCount !== 0 || record.activeUserTransactions !== 0
        || ![null, 0].includes(record.transactionState)) fail('TRANSACTION_OPEN');
    if (record.status !== 'sleeping' || record.activeRequests !== 0
        || record.blockedRequests !== 0 || record.waitingRequests !== 0) fail('OBSERVATION_FAILED');
  }
  return 'CONNECTION_STILL_VISIBLE';
}
/** One ephemeral independent observer; native close is guaranteed even on error.
 * No persistent pool, polling or fallback to program_name. */
async function observeCapturedAfterClose(sql, config, ledgers, scope) {
  const ids = ledgers.map(l => requireCompleteIdentity(l.begin?.identity));
  let pool, primary, result, poolFault = false;
  try {
    pool = new sql.ConnectionPool(config);
    pool.on('error', () => { poolFault = true; });
    await pool.connect();
    const observer = retainRecord(scope, await capture(sql, pool, 'OBSERVER'));
    result = { observer, connections: [] };
    for (let index = 0; index < ids.length; index++) {
      const rows = await readDiagnostic(sql, pool, correlationStatement(ids[index]));
      const residual = residualResult(ids[index], rows, observer.identity.sessionId);
      for (const record of residual.records) retainRecord(scope, record);
      result.connections.push({ captured: ledgers[index].begin, ...residual });
      if (result.connections.at(-1).code === 'TRANSACTION_OPEN') break;
    }
    if (poolFault) fail('OBSERVATION_FAILED');
  } catch { primary = new ConnectionObservationError('OBSERVATION_FAILED'); }
  finally {
    if (pool) {
      try { await pool.close(); }
      catch {
        if (primary) primary.cleanupCode = 'NATIVE_CLOSE_FAILED';
        else primary = new ConnectionObservationError('NATIVE_CLOSE_FAILED');
      }
    }
  }
  ids.length = 0;
  if (primary) throw primary;
  return result;
}

/** Scoped post-close observation. No retry, delay or second observation is added.
 * The caller owns disposal in finally after consuming only public projections. */
export async function observeAfterClose(sql, config, ledgers, scope) {
  const state = scope ? scopeState(scope) : null;
  if (state) state.busy++;
  try {
    for (const ledger of ledgers) {
      retainLedger(scope, ledger);
      if (scope) assertLeaseClean(ledger);
    }
    return await observeCapturedAfterClose(sql, config, ledgers, scope);
  } finally { if (state) state.busy--; }
}
