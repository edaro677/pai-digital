import test from 'node:test';
import assert from 'node:assert/strict';
import { runSqlDiagnostic } from '../../scripts/sql-diagnostic.mjs';

test('SQL optativo: Node 24, Windows integrada, Shared Memory, SELECT y rollback sin escrituras', {
  skip: process.env.PAI_SQL_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  const trace = process.env.PAI_SQL_TRACE === '1';
  const records = [];
  const result = await runSqlDiagnostic({ trace, onTrace: record => {
    records.push(record);
    console.log(JSON.stringify(record));
  } });
  if (trace) {
    assert.equal(records.length, 16);
    assert.ok(records.every(record => record.result === 'ok'));
    assert.equal(records.at(-1).stage, 'CLOSE');
    assert.equal(records.at(-1).connected, false);
  }
  assert.equal(result.status, 'ok');
  assert.equal(result.server.transport, 'Shared memory');
  assert.equal(result.functionalTables.length, 8);
  assert.deepEqual(result.transaction, { before: 0, during: 1, after: 0,
    afterState: 0, rollback: 'completed', sameSession: true });
  assert.equal(result.pool.closed, true);
  assert.equal(result.pool.borrowedBeforeClose, 0);
  assert.equal(result.pool.pendingBeforeClose, 0);
});
