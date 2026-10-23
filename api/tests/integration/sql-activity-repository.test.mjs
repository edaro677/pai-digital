import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { SqlActivityRepository } from '../../.local-build/infrastructure/sql/repositories/activity.js';
import { LocalOdbcTransport, localOdbcConfig } from '../../.local-build/infrastructure/sql/odbc.js';
import { SqlSessionRunner } from '../../.local-build/infrastructure/sql/session.js';
import { SqlInfrastructureError } from '../../.local-build/infrastructure/sql/errors.js';
import { identifier } from '../../.local-build/infrastructure/sql/codecs.js';
import { parseSqlcmdSnapshot, withFinalSnapshot } from '../helpers/sql-snapshot.mjs';
import { createObservationScope, instrumentLease, assertLeaseClean, observeAfterClose,
  assessResidual, publicObservation } from '../helpers/sql-connection-observer.mjs';

// Same read-only snapshot contract as L8-C2, with its existing sanitized helper.
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
  return parseSqlcmdSnapshot(() => execFileSync(
    'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\SQLCMD.EXE',
    ['-S', 'lpc:.\\PAIPOC', '-E', '-d', 'pai_poc_dev', '-l', '5', '-t', '5', '-b', '-y', '0', '-w', '65535', '-Q', snapshotSql],
    { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }),
  evidence => console.log(JSON.stringify({ snapshot: evidence })));
}
function assertSnapshot(value) {
  assert.equal(value.state, 'ONLINE'); assert.equal(value.tables, 8); assert.equal(value.rows, 0);
  assert.ok(Array.isArray(value.history)); assert.equal(value.history.length, 1);
  assert.equal(value.history[0].MigrationId, '0001_initial');
  assert.equal(value.history[0].UpSha256.toLowerCase(), '29634f596d609ea6b031ed50f1641180d4dd0f2d6fd40ff3357e60a184b1d35f');
}

// Importing/skipping this file does not load the native driver or execute SQL.
test('ActivityRepository ODBC: null/lista vacía, rollback, cierre e integridad', {
  skip: process.env.PAI_SQL_ACTIVITY_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  const scope = createObservationScope(); let before, sql, ledger;
  try {
    const summary = await withFinalSnapshot(async () => {
      before = snapshot(); assertSnapshot(before);
      const transport = new LocalOdbcTransport({ trace: true,
        onTrace: record => console.log(JSON.stringify(record)),
        loadDriver: async () => {
          try { sql = (await import('mssql/msnodesqlv8.js')).default; }
          catch { throw new SqlInfrastructureError('SQL_CONNECT_FAILED'); }
          const instrumented = instrumentLease(sql, { scope });
          ledger = instrumented.ledger; return instrumented.driver;
        } });
      const reads = await new SqlSessionRunner(transport).run('rollback', async session => {
        const [state] = await session.execute({ text: `SELECT @@TRANCOUNT AS count,
          XACT_STATE() AS state, DB_NAME() AS databaseName,
          CONNECTIONPROPERTY('net_transport') AS transport,
          (SELECT transaction_isolation_level FROM sys.dm_exec_sessions WHERE session_id=@@SPID) AS isolation;`, parameters: [] });
        assert.equal(state.count, 1); assert.equal(state.state, 1); assert.equal(state.isolation, 4);
        assert.equal(state.databaseName, 'pai_poc_dev'); assert.equal(state.transport, 'Shared memory');
        const repository = new SqlActivityRepository(session);
        assert.equal(await repository.findById(identifier('activity').decode('poc-missing-activity')), null);
        assert.deepEqual(await repository.listByFicha(identifier('ficha').decode('poc-missing-ficha')), []);
        return { findByIdNull: true, listByFichaEmpty: true, serializable: true, sharedMemory: true };
      });
      // The runner has attempted rollback and close before these assertions.
      assertLeaseClean(ledger);
      assert.equal(ledger.pool.connected, false); assert.equal(ledger.pool.pool, null);
      const config = localOdbcConfig();
      config.connectionString = config.connectionString.replace('APP=PAI-L8C2-Transport;', 'APP=PAI-L8C2-Observer;');
      const observation = await observeAfterClose(sql, config, [ledger], scope);
      const warnings = observation.connections.map(assessResidual).filter(Boolean);
      console.log(JSON.stringify({ connections: observation.connections.map(result => ({
        captured: publicObservation(result.captured), nativeCloseResolved: ledger.nativeCloseResolved,
        classification: result.code, severity: result.code ? 'warning' : 'none',
        residuals: result.records.map(publicObservation),
      })) }));
      return { ...reads, rollbackSucceeded: true, poolClosed: true,
        pendingOperations: 0, abandonedTransactions: 0,
        closureWarning: warnings.length ? 'CONNECTION_STILL_VISIBLE' : null,
        databaseOnline: true, functionalTables: 8, functionalRows: 0, migrationUnchanged: true };
    }, () => {
      const after = snapshot(); assertSnapshot(after);
      if (before !== undefined) assert.deepEqual(after, before, 'Snapshot/history changed');
    }, evidence => console.log(JSON.stringify({ finalSnapshot: evidence })));
    console.log(JSON.stringify(summary));
  } finally { scope.dispose(); }
});
