import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SqlActivityRepository } from '../.local-build/infrastructure/sql/repositories/activity.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';
import { SqlInfrastructureError } from '../.local-build/infrastructure/sql/errors.js';
import { entityId } from '../.local-build/domain/types.js';

const activityId = entityId('activity', 'activity-B'), fichaId = entityId('ficha', 'ficha-A');
const privateText = 'EMPRESA\\usuario.prueba C:\\Privado\\usuario.prueba Password=ficticia';
const row = (overrides = {}) => ({ Id: activityId, FichaId: fichaId, Description: 'PoC á😀漢字',
  RV: Uint8Array.from([0, 1, 2, 3, 252, 253, 254, 255]), ...overrides });
function setup(rows = [row()], queryError = null) {
  const calls = [], statements = [];
  const tx = {
    async execute(statement) {
      calls.push('query'); statements.push(statement);
      if (queryError) throw queryError;
      return rows;
    },
    async rollback() { calls.push('rollback'); },
    async commit() { calls.push('commit'); },
  };
  const runner = new SqlSessionRunner({ async connect() {
    calls.push('connect');
    return { async begin(isolation) { assert.equal(isolation, 'SERIALIZABLE'); calls.push('begin'); return tx; },
      async close() { calls.push('close'); } };
  } });
  return { calls, statements, run: work => runner.run('rollback', session => work(new SqlActivityRepository(session))) };
}
function safeError(code) {
  return error => {
    assert.equal(error.code, code); assert.equal(error.stack, undefined);
    assert.equal(error.cause, undefined); assert.equal(error.originalError, undefined);
    assert.equal(JSON.stringify(error).includes(privateText), false);
    assert.equal(String(error).includes(privateText), false);
    return true;
  };
}
test('activity SQL: constructor only retains session; implements read-only contract', () => {
  let calls = 0;
  const repo = new SqlActivityRepository({ execute() { calls++; throw new Error(); } });
  assert.equal(typeof repo.findById, 'function'); assert.equal(typeof repo.listByFicha, 'function');
  assert.equal(repo.create, undefined); assert.equal(repo.update, undefined);
  assert.equal(calls, 0);
  const source = readFileSync(new URL('../src/infrastructure/sql/repositories/activity.ts', import.meta.url), 'utf8');
  assert.match(source, /implements ActivityRepository/);
  assert.match(source, /constructor\(private readonly session: SqlSession\)/);
  assert.doesNotMatch(source, /ConnectionPool|from ['"](?:mssql|@azure\/functions)/);
});
test('activity SQL: ID query binds varchar(64) without interpolation', async () => {
  const f = setup(); await f.run(repo => repo.findById(activityId));
  assert.deepEqual(f.statements, [{ text: 'SELECT Id, FichaId, Description, RV FROM pai.Activities WHERE Id = @id;',
    parameters: [{ name: 'id', type: 'varchar', length: 64, value: activityId }] }]);
  assert.equal(f.statements[0].text.includes(activityId), false);
  assert.deepEqual(f.calls, ['connect', 'begin', 'query', 'rollback', 'close']);
});
test('activity SQL: maps identifiers, Unicode and exact eight-byte rowversion', async () => {
  const f = setup([row({ InsertionOrder: '9223372036854775807', ignored: privateText })]);
  const value = await f.run(repo => repo.findById(activityId));
  assert.deepEqual(value, { id: activityId, fichaId, description: 'PoC á😀漢字', version: 'rv1:00010203fcfdfeff' });
  assert.deepEqual(Object.keys(value), ['id', 'fichaId', 'description', 'version']);
});
test('activity SQL: missing ID returns null', async () => {
  assert.equal(await setup([]).run(repo => repo.findById(activityId)), null);
});
test('activity SQL: empty ficha returns empty list', async () => {
  assert.deepEqual(await setup([]).run(repo => repo.listByFicha(fichaId)), []);
});
test('activity SQL: ficha query orders in SQL and preserves returned insertion order', async () => {
  const f = setup([row({ Id: 'activity-Z' }), row({ Id: 'activity-A' })]);
  const values = await f.run(repo => repo.listByFicha(fichaId));
  assert.deepEqual(values.map(a => a.id), ['activity-Z', 'activity-A']);
  assert.deepEqual(f.statements, [{ text: 'SELECT Id, FichaId, Description, RV FROM pai.Activities WHERE FichaId = @fichaId ORDER BY InsertionOrder ASC;',
    parameters: [{ name: 'fichaId', type: 'varchar', length: 64, value: fichaId }] }]);
  assert.equal(f.statements[0].text.includes(fichaId), false);
});
test('activity SQL: independent results and no mutation of driver rows/bytes', async () => {
  const original = row(), f = setup([original]);
  await f.run(async repo => {
    const first = await repo.findById(activityId); first.description = 'changed';
    const list = await repo.listByFicha(fichaId); list[0].description = 'also changed'; list.push(first);
    const next = await repo.findById(activityId);
    assert.equal(next.description, original.Description); assert.equal(next.version, 'rv1:00010203fcfdfeff');
  });
  assert.equal(original.Description, 'PoC á😀漢字');
  assert.deepEqual([...original.RV], [0, 1, 2, 3, 252, 253, 254, 255]);
});
for (const method of ['findById', 'listByFicha']) {
  test(`activity SQL: ${method} rejects closed session without new I/O`, async () => {
    const f = setup(); let retained;
    await f.run(async repo => { retained = repo; });
    const before = f.calls.length;
    await assert.rejects(retained[method](method === 'findById' ? activityId : fichaId), safeError('SQL_SESSION_CLOSED'));
    assert.equal(f.calls.length, before);
  });
  test(`activity SQL: ${method} sanitizes query errors and rolls back`, async () => {
    const raw = Object.assign(new Error(privateText), { originalError: { message: privateText } });
    const f = setup([], raw);
    await assert.rejects(f.run(repo => repo[method](method === 'findById' ? activityId : fichaId)), safeError('SQL_QUERY_FAILED'));
    assert.deepEqual(f.calls.slice(-2), ['rollback', 'close']);
    assert.equal(f.calls.filter(c => c === 'query').length, 1);
  });
  test(`activity SQL: ${method} validates identifier before execute`, async () => {
    const statements = [], repo = new SqlActivityRepository({ async execute(s) { statements.push(s); return []; } });
    await assert.rejects(repo[method]("x'; DROP TABLE pai.Activities;--"), safeError('SQL_CODEC_INVALID'));
    assert.deepEqual(statements, []);
  });
}
for (const [field, value] of [['Id', 'bad id'], ['FichaId', null], ['Description', undefined],
  ['RV', new Uint8Array(7)], ['RV', new Uint8Array(9)], ['RV', null]]) {
  test(`activity SQL: invalid ${field} rejected with sanitized codec error (${value instanceof Uint8Array ? value.length : typeof value})`, async () => {
    const f = setup([row({ [field]: value })]);
    await assert.rejects(f.run(repo => repo.findById(activityId)), safeError('SQL_CODEC_INVALID'));
    assert.deepEqual(f.calls.slice(-2), ['rollback', 'close']);
  });
}
test('activity SQL: unexpected duplicate primary-key result rejects rather than selecting one', async () => {
  await assert.rejects(setup([row(), row()]).run(repo => repo.findById(activityId)), safeError('SQL_CODEC_INVALID'));
});
test('activity SQL: raw session double error is sanitized without relying on native driver', async () => {
  const repo = new SqlActivityRepository({ async execute() { throw new Error(privateText); } });
  await assert.rejects(repo.findById(activityId), safeError('SQL_QUERY_FAILED'));
});
