import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseSqlcmdSnapshot, withFinalSnapshot } from '../helpers/sql-snapshot.mjs';
import { LocalOdbcTransport, localOdbcConfig } from '../../.local-build/infrastructure/sql/odbc.js';
import { SqlSessionRunner } from '../../.local-build/infrastructure/sql/session.js';
import { SqlInfrastructureError } from '../../.local-build/infrastructure/sql/errors.js';
import * as codecs from '../../.local-build/infrastructure/sql/codecs.js';
import { instrumentLease, assertLeaseClean, observeAfterClose, publicObservation,
  assessResidual, createObservationScope } from '../helpers/sql-connection-observer.mjs';

// Explicitly opt-in; no native import or SQL access when skipped. No DML/DDL/commit.
const snapshotSql = `SET NOCOUNT ON;
SELECT DATABASEPROPERTYEX(DB_NAME(),'Status') AS state,
 (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pai')) AS tables,
 (SELECT COUNT(*) FROM pai.InstitutionalUsers)+(SELECT COUNT(*) FROM pai.Dependencies)+
 (SELECT COUNT(*) FROM pai.Fichas)+(SELECT COUNT(*) FROM pai.AccessAssignments)+
 (SELECT COUNT(*) FROM pai.Activities)+(SELECT COUNT(*) FROM pai.Reports)+
 (SELECT COUNT(*) FROM pai.AuditEvents)+(SELECT COUNT(*) FROM pai.IdempotencyRecords) AS rows,
 (SELECT MigrationId,UpSha256,VerifySha256,DownSha256,CatalogSha256,
 CONVERT(varchar(24),AppliedAtUtc,126) AS AppliedAtUtc FROM pai_meta.SchemaMigrations
 WHERE MigrationId=N'0001_initial' FOR JSON PATH) AS history FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`;
function snapshot() {
  return parseSqlcmdSnapshot(() => execFileSync('C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\SQLCMD.EXE',
      ['-S', 'lpc:.\\PAIPOC', '-E', '-d', 'pai_poc_dev', '-l', '5', '-t', '5', '-b', '-y', '0', '-w', '65535', '-Q', snapshotSql],
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }),
    evidence => console.log(JSON.stringify({ snapshot: evidence })));
}
function assertSnapshot(value) {
  assert.equal(value.state, 'ONLINE'); assert.equal(value.tables, 8);
  assert.equal(value.rows, 0);
  // FOR JSON nests a JSON-producing subquery as an array, not an escaped string.
  const history = value.history;
  assert.ok(Array.isArray(history));
  assert.equal(history.length, 1);
  assert.equal(history[0].UpSha256.toLowerCase(), '29634f596d609ea6b031ed50f1641180d4dd0f2d6fd40ff3357e60a184b1d35f');
}
test('ODBC real optativo: tipos sintéticos, SERIALIZABLE, rollback y cierre, sin escrituras', {
  skip: process.env.PAI_SQL_TRANSPORT_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  const identityScope = createObservationScope();
  let before;
  try {
  const summary = await withFinalSnapshot(async () => {
  before = snapshot();
  assertSnapshot(before);
  const records = [];
  const leases = [];
  let sql, main, duringSpid;
  const transport = new LocalOdbcTransport({ trace: true, onTrace: r => { records.push(r); console.log(JSON.stringify(r)); },
    loadDriver: async () => {
      try { sql = (await import('mssql/msnodesqlv8.js')).default; }
      catch { throw new SqlInfrastructureError('SQL_CONNECT_FAILED'); }
      const instrumented = instrumentLease(sql, { scope: identityScope });
      main = instrumented.ledger; leases.push(main);
      return instrumented.driver;
    } });
  await new SqlSessionRunner(transport).run('rollback', async session => {
    const [state] = await session.execute({ text: `SELECT @@TRANCOUNT AS count, XACT_STATE() AS state, @@SPID AS spid,
      DB_NAME() AS databaseName, CONNECTIONPROPERTY('net_transport') AS transport,
      (SELECT transaction_isolation_level FROM sys.dm_exec_sessions WHERE session_id=@@SPID) AS isolation,
      (SELECT auth_scheme FROM sys.dm_exec_connections WHERE session_id=@@SPID) AS authentication;`, parameters: [] });
    duringSpid = state.spid;
    assert.equal(state.count, 1); assert.equal(state.state, 1); assert.equal(state.isolation, 4);
    assert.equal(state.databaseName, 'pai_poc_dev'); assert.equal(state.transport, 'Shared memory');
    assert.ok(['NTLM', 'KERBEROS'].includes(state.authentication));
    const guid = '11111111-1111-4111-8111-111111111111', iso = '2026-01-02T03:04:05.123Z';
    const bytes = Uint8Array.from([0, 1, 2, 3, 252, 253, 254, 255]);
    const [row] = await session.execute({ text: `SELECT @text AS textValue, @guid AS guidValue, @instant AS instantValue,
      @flag AS flagValue, @integer AS integerValue, @fixed AS fixedValue, @variable AS variableValue,
      @short AS shortValue, @emptyText AS emptyTextValue, @nothing AS nullValue, @@DBTS AS databaseRowversion;`, parameters: [
      { name: 'text', type: 'nvarchar', length: 128, value: 'PoC á😀 sintética' },
      { name: 'guid', type: 'uniqueidentifier', value: guid },
      { name: 'instant', type: 'datetime2', scale: 3, value: new Date(iso) },
      { name: 'flag', type: 'bit', value: true },
      { name: 'integer', type: 'bigint', value: '9223372036854775807' },
      { name: 'fixed', type: 'binary', length: 8, value: bytes },
      { name: 'variable', type: 'varbinary', length: 8, value: bytes },
      { name: 'short', type: 'varbinary', length: 8, value: Uint8Array.from([1, 2, 3]) },
      { name: 'emptyText', type: 'nvarchar', length: 128, value: '' },
      { name: 'nothing', type: 'nvarchar', length: 128, value: null },
    ] });
    // Raw values stay in memory; only fixed type labels and booleans are reported.
    console.log(JSON.stringify({ typesObserved: { nvarchar: typeof row.textValue, uniqueidentifier: typeof row.guidValue,
      datetime2Date: row.instantValue instanceof Date, bit: typeof row.flagValue, bigint: typeof row.integerValue,
      binaryBytes: row.fixedValue instanceof Uint8Array, varbinaryBytes: row.variableValue instanceof Uint8Array,
      databaseRowversionBytes: row.databaseRowversion instanceof Uint8Array },
      emptyTextPreserved: row.emptyTextValue === '',
      textNullPreserved: row.nullValue === null }));
    const check = (name, work) => {
      try { work(); }
      catch { console.log(JSON.stringify({ compatibilityCheck: name, result: 'failed' }));
        throw new SqlInfrastructureError('SQL_CODEC_INVALID'); }
    };
    check('nvarchar', () => assert.equal(codecs.unicodeText.decode(row.textValue), 'PoC á😀 sintética'));
    check('uniqueidentifier', () => assert.equal(codecs.guid('tenant').decode(row.guidValue), guid));
    check('datetime2', () => assert.equal(codecs.instant.decode(row.instantValue), iso));
    check('bit', () => assert.equal(codecs.bit.decode(row.flagValue), true));
    check('bigint', () => assert.equal(codecs.insertionOrder.decode(row.integerValue), 9223372036854775807n));
    check('binary', () => assert.deepEqual([...row.fixedValue], [...bytes]));
    check('varbinary', () => assert.deepEqual([...row.variableValue], [...bytes]));
    check('short-binary', () => assert.deepEqual([...row.shortValue], [1, 2, 3]));
    check('text-null', () => assert.equal(row.nullValue, null));
    check('text-empty', () => assert.equal(row.emptyTextValue, ''));
    check('database-rowversion', () => assert.match(codecs.rowversion.decode(row.databaseRowversion), /^rv1:[0-9a-f]{16}$/));
  });
  // First establish native cleanup, THEN evaluate observations/assertions.
  assertLeaseClean(main);
  assert.equal(main.pool.connected, false); assert.equal(main.pool.pool, null);
  assert.equal(main.begin.identity.sessionId, duringSpid);
  assert.ok(records.every(r => r.result === 'ok'));
  assert.equal(records.at(-1).stage, 'CLOSE'); assert.equal(records.at(-1).connected, false);
  // Each rejected operation gets its own rollback-only session: C1 deliberately
  // poisons a session on ANY failed execute, even if the callback catches it.
  for (const type of ['binary', 'varbinary']) {
    let inputCalls = 0, queryCalls = 0;
    class CountingRequest extends sql.Request {
      input(...args) { inputCalls++; return super.input(...args); }
      query(...args) { queryCalls++; return super.query(...args); }
    }
    const instrumented = instrumentLease(sql, { requestType: CountingRequest, scope: identityScope });
    leases.push(instrumented.ledger);
    const guarded = new LocalOdbcTransport({ loadDriver: async () => instrumented.driver });
    const original = Buffer.alloc(0);
    await assert.rejects(new SqlSessionRunner(guarded).run('rollback', session => session.execute({
      text: 'SELECT @empty AS value;', parameters: [{ name: 'empty', type, length: 8, value: original }],
    })), error => {
      assert.equal(error.code, 'SQL_QUERY_FAILED'); assert.equal(error.stack, undefined);
      assert.equal(error.cause, undefined); return true;
    });
    assert.equal(inputCalls, 0); assert.equal(queryCalls, 0); assert.equal(original.length, 0);
    assertLeaseClean(instrumented.ledger);
    assert.equal(instrumented.ledger.pool.connected, false);
    assert.equal(instrumented.ledger.pool.pool, null);
  }
  // Ephemeral observer: only captured composite identities, no app-name fallback.
  const observerConfig = localOdbcConfig();
  observerConfig.connectionString = observerConfig.connectionString.replace('APP=PAI-L8C2-Transport;', 'APP=PAI-L8C2-Observer;');
  const observation = await observeAfterClose(sql, observerConfig, leases, identityScope);
  const warnings = observation.connections.map(assessResidual).filter(Boolean);
  console.log(JSON.stringify({ observer: publicObservation(observation.observer), connections: observation.connections.map((result, index) => ({
    lease: index + 1, captured: publicObservation(result.captured),
    nativeClose: { invoked: leases[index].nativeCloseInvoked, resolved: leases[index].nativeCloseResolved },
    classification: result.code, severity: result.code ? 'warning' : 'none', residuals: result.records.map(publicObservation),
  })) }));
  return { databaseOnline: true, migrationUnchanged: true, functionalTables: 8,
    functionalRows: 0, residualCapturedLeases: warnings.length, closureWarning: warnings.length ? 'CONNECTION_STILL_VISIBLE' : null,
    transactionAfterRollback: { count: main.beforeClose.transactionCount, state: main.beforeClose.transactionState },
    sameSession: true, poolClosed: true, nativeCloseResolved: main.nativeCloseResolved, observationSucceeded: true,
    emptyBinaryRejectedBeforeInput: true };
  }, () => {
    const after = snapshot();
    assertSnapshot(after);
    if (before !== undefined) assert.deepEqual(after, before, 'History, empty data and ONLINE status must be unchanged');
  }, evidence => console.log(JSON.stringify({ finalSnapshot: evidence })));
  // Reached only after the independent final snapshot and all blocking checks pass.
  console.log(JSON.stringify(summary));
  } finally {
    // Drop full IDs and pool/snapshot references on success AND every failure path.
    identityScope.dispose();
  }
});
