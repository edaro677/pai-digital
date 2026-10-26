import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SqlFichaRepository } from '../.local-build/infrastructure/sql/repositories/ficha.js';
import { SqlUserRepository } from '../.local-build/infrastructure/sql/repositories/user.js';
import { SqlAssignmentRepository } from '../.local-build/infrastructure/sql/repositories/assignment.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';
import { SqlInfrastructureError } from '../.local-build/infrastructure/sql/errors.js';
import { entityId, version } from '../.local-build/domain/types.js';

const secret = 'EMPRESA\\usuario.prueba C:\\Privado\\usuario.prueba Password=sintetica';
const rv = n => Uint8Array.from([0, 0, 0, 0, 0, 0, 0, n]);
const oldVersion = version('rv1:0000000000000001');
const ficha = (Id = 'ficha-A', extra = {}) => ({ Id, DependencyId: 'dep-A', CycleLabel: 'PoC á😀', RV: rv(1), ...extra });
const user = (extra = {}) => ({ Id: 'user-A', TenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  DirectoryObjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', Alias: 'Usuario á😀', Enabled: true, RV: rv(1), ...extra });
const assignment = (extra = {}) => ({ Id: 'assignment-A', UserId: 'user-A', FichaId: 'ficha-A',
  Capability: 'poc:read', Enabled: false, ValidFrom: new Date('2020-01-01T00:00:00.123Z'),
  ValidUntil: null, RV: rv(1), ...extra });
function fake(script = () => []) {
  const calls = [], statements = [];
  const tx = { async execute(s) { calls.push('query'); statements.push(s); return script(s, statements.length); },
    async rollback() { calls.push('rollback'); }, async commit() { calls.push('commit'); } };
  const runner = new SqlSessionRunner({ async connect() { calls.push('connect'); return {
    async begin(isolation) { assert.equal(isolation, 'SERIALIZABLE'); calls.push('begin'); return tx; },
    async close() { calls.push('close'); },
  }; } });
  return { calls, statements, run: (Repo, work) => runner.run('rollback', session => work(new Repo(session))) };
}
const code = expected => error => {
  assert.equal(error.code, expected); assert.equal(error.stack, undefined);
  assert.equal(error.cause, undefined); assert.equal(error.originalError, undefined);
  assert.equal(JSON.stringify(error).includes(secret), false); return true;
};
const specs = [
  { name: 'Ficha', Repo: SqlFichaRepository, file: 'ficha', id: entityId('ficha', 'ficha-A'), row: ficha() },
  { name: 'User', Repo: SqlUserRepository, file: 'user', id: entityId('user', 'user-A'), row: user() },
  { name: 'Assignment', Repo: SqlAssignmentRepository, file: 'assignment', id: entityId('assignment', 'assignment-A'), row: assignment() },
];
for (const spec of specs) {
  test(`${spec.name}: constructor and compiled contract expose only session dependency`, () => {
    const source = readFileSync(new URL(`../src/infrastructure/sql/repositories/${spec.file}.ts`, import.meta.url), 'utf8');
    assert.ok(source.includes(`implements ${spec.name === 'User' ? 'User' : spec.name}Repository`));
    assert.match(source, /constructor\(private readonly session: SqlSession\)/);
    assert.doesNotMatch(source, /ConnectionPool|\.commit\(|\.rollback\(|@azure\/functions/);
    let calls = 0; new spec.Repo({ execute() { calls++; } }); assert.equal(calls, 0);
  });
  test(`${spec.name}: ID lookup parameters, positive mapping and null`, async () => {
    const f = fake(() => [spec.row]);
    const result = await f.run(spec.Repo, repo => repo.findById(spec.id));
    assert.equal(result.id, spec.id); assert.equal(result.version, oldVersion);
    assert.deepEqual(f.statements[0].parameters, [{ name: 'id', type: 'varchar', length: 64, value: spec.id }]);
    assert.match(f.statements[0].text, /WHERE Id = @id;/);
    assert.equal(f.statements[0].text.includes(spec.id), false);
    assert.equal(await fake().run(spec.Repo, repo => repo.findById(spec.id)), null);
  });
  test(`${spec.name}: independent results`, async () => {
    const f = fake(() => [spec.row]);
    await f.run(spec.Repo, async repo => {
      const a = await repo.findById(spec.id); a.id = 'changed'; a.version = 'changed';
      const b = await repo.findById(spec.id); assert.equal(b.id, spec.id); assert.equal(b.version, oldVersion);
    });
  });
  test(`${spec.name}: closed session refuses lookup without extra I/O`, async () => {
    const f = fake(); let retained;
    await f.run(spec.Repo, async repo => { retained = repo; });
    const count = f.calls.length;
    await assert.rejects(retained.findById(spec.id), code('SQL_SESSION_CLOSED'));
    assert.equal(f.calls.length, count);
  });
  test(`${spec.name}: infrastructure error sanitized and rollback retained`, async () => {
    const f = fake(() => { throw Object.assign(new Error(secret), { originalError: secret }); });
    await assert.rejects(f.run(spec.Repo, repo => repo.findById(spec.id)), code('SQL_QUERY_FAILED'));
    assert.deepEqual(f.calls.slice(-2), ['rollback', 'close']);
    const direct = new spec.Repo({ async execute() { throw new Error(secret); } });
    await assert.rejects(direct.findById(spec.id), code('SQL_QUERY_FAILED'));
  });
  test(`${spec.name}: duplicate single result and malformed RV fail safely`, async () => {
    await assert.rejects(fake(() => [spec.row, spec.row]).run(spec.Repo, repo => repo.findById(spec.id)), code('SQL_CODEC_INVALID'));
    await assert.rejects(fake(() => [{ ...spec.row, RV: new Uint8Array(7) }]).run(spec.Repo, repo => repo.findById(spec.id)), code('SQL_CODEC_INVALID'));
  });
}
test('Ficha: maps dependency and Unicode cycle label without exposing SQL names', async () => {
  assert.deepEqual(await fake(() => [ficha()]).run(SqlFichaRepository, r => r.findById('ficha-A')),
    { id: 'ficha-A', dependencyId: 'dep-A', cycleLabel: 'PoC á😀', version: oldVersion });
});
test('Ficha: findByIds deduplicates and restores input order despite unordered SQL rows', async () => {
  const f = fake(() => [ficha('ficha-A'), ficha('ficha-Z')]);
  const ids = ['ficha-Z', 'ficha-A', 'ficha-Z', 'missing'];
  const result = await f.run(SqlFichaRepository, repo => repo.findByIds(ids));
  assert.deepEqual(result.map(r => r.id), ['ficha-Z', 'ficha-A']);
  assert.deepEqual(ids, ['ficha-Z', 'ficha-A', 'ficha-Z', 'missing']);
  assert.deepEqual(f.statements[0].parameters.map(p => p.value), ['ficha-Z', 'ficha-A', 'missing']);
  assert.match(f.statements[0].text, /WHERE Id IN \(@id0, @id1, @id2\);/);
  assert.ok(f.statements[0].parameters.every(p => p.type === 'varchar' && p.length === 64));
  assert.equal(f.statements[0].text.includes('ficha-Z'), false);
});
test('Ficha: empty input/list and session lifetime are all respected', async () => {
  const f = fake(); let retained;
  await f.run(SqlFichaRepository, async repo => {
    retained = repo; assert.deepEqual(await repo.findByIds([]), []);
    assert.deepEqual(await repo.findByIds(['missing']), []);
  });
  assert.match(f.statements[0].text, /WHERE 1 = 0;/);
  await assert.rejects(retained.findByIds([]), code('SQL_SESSION_CLOSED'));
});
test('Ficha: parameter batches preserve global order without an L2 length limit', async () => {
  const ids = Array.from({ length: 501 }, (_, i) => `ficha-${i}`);
  const f = fake(s => [...s.parameters].reverse().map(p => ficha(p.value)));
  const result = await f.run(SqlFichaRepository, repo => repo.findByIds([...ids, ids[0]]));
  assert.deepEqual(result.map(r => r.id), ids);
  assert.deepEqual(f.statements.map(s => s.parameters.length), [500, 1]);
});
test('Ficha: impossible returned ID or duplicate ID is rejected', async () => {
  for (const rows of [[ficha('unexpected')], [ficha(), ficha()]]) {
    await assert.rejects(fake(() => rows).run(SqlFichaRepository, repo => repo.findByIds(['ficha-A'])), code('SQL_CODEC_INVALID'));
  }
});
test('User: composite identity uses two uniqueidentifier bindings and preserves canonical GUIDs', async () => {
  const f = fake(() => [user({ TenantId: user().TenantId.toUpperCase(), DirectoryObjectId: user().DirectoryObjectId.toUpperCase() })]);
  const value = await f.run(SqlUserRepository, repo => repo.findByIdentity(user().TenantId, user().DirectoryObjectId));
  assert.equal(value.tenantId, user().TenantId); assert.equal(value.directoryObjectId, user().DirectoryObjectId);
  assert.equal(value.alias, 'Usuario á😀'); assert.equal(value.enabled, true);
  assert.deepEqual(f.statements[0].parameters, [
    { name: 'tenantId', type: 'uniqueidentifier', value: user().TenantId },
    { name: 'directoryObjectId', type: 'uniqueidentifier', value: user().DirectoryObjectId },
  ]);
  assert.match(f.statements[0].text, /TenantId = @tenantId AND DirectoryObjectId = @directoryObjectId/);
  assert.equal(await fake().run(SqlUserRepository, repo => repo.findByIdentity(user().TenantId, user().DirectoryObjectId)), null);
});
test('Assignment: list preserves order and includes disabled, expired and future windows', async () => {
  const rows = [assignment({ Id: 'assignment-Z', ValidUntil: new Date('2021-01-01T00:00:00.000Z') }),
    assignment({ Id: 'assignment-A', ValidFrom: new Date('2090-01-01T00:00:00.000Z'), Enabled: true })];
  const f = fake(() => rows);
  const result = await f.run(SqlAssignmentRepository, repo => repo.listByUserAndFicha('user-A', 'ficha-A'));
  assert.deepEqual(result.map(r => r.id), ['assignment-Z', 'assignment-A']);
  assert.equal(result[0].enabled, false); assert.equal(result[0].validUntil, '2021-01-01T00:00:00.000Z');
  assert.equal(result[1].validFrom, '2090-01-01T00:00:00.000Z');
  assert.match(f.statements[0].text, /WHERE UserId = @userId AND FichaId = @fichaId ORDER BY InsertionOrder ASC;/);
  assert.doesNotMatch(f.statements[0].text, /AND Enabled|ValidFrom\s*[<>]|ValidUntil\s*[<>]/);
  assert.deepEqual(f.statements[0].parameters, [
    { name: 'userId', type: 'varchar', length: 64, value: 'user-A' },
    { name: 'fichaId', type: 'varchar', length: 64, value: 'ficha-A' },
  ]);
  assert.deepEqual(await fake().run(SqlAssignmentRepository, repo => repo.listByUserAndFicha('user-A', 'missing')), []);
});
test('Assignment: nullable dates and synthetic capabilities are decoded strictly', async () => {
  const value = await fake(() => [assignment()]).run(SqlAssignmentRepository, r => r.findById('assignment-A'));
  assert.equal(value.validUntil, null); assert.equal(value.validFrom, '2020-01-01T00:00:00.123Z');
  assert.equal(value.capability, 'poc:read');
  for (const extra of [{ Capability: 'admin' }, { ValidUntil: undefined }, { ValidFrom: new Date('invalid') }]) {
    await assert.rejects(fake(() => [assignment(extra)]).run(SqlAssignmentRepository, r => r.findById('assignment-A')), code('SQL_CODEC_INVALID'));
  }
});
for (const spec of specs.filter(s => s.name !== 'Ficha')) {
  test(`${spec.name}: setEnabled guards RV, binds bit and returns new database version`, async () => {
    const f = fake((s, n) => n === 1 ? [spec.row] : [{ ...spec.row, Enabled: true, RV: rv(2) }]);
    const value = await f.run(spec.Repo, repo => repo.setEnabled(spec.id, oldVersion, true));
    assert.equal(value.version, 'rv1:0000000000000002'); assert.equal(value.enabled, true);
    const update = f.statements[1];
    assert.match(update.text, / SET Enabled = @enabled OUTPUT INSERTED\./);
    assert.match(update.text, /WHERE Id = @id AND RV = @expectedVersion;/);
    assert.deepEqual(update.parameters, [
      { name: 'id', type: 'varchar', length: 64, value: spec.id },
      { name: 'expectedVersion', type: 'binary', length: 8, value: rv(1) },
      { name: 'enabled', type: 'bit', value: true },
    ]);
    assert.deepEqual(f.calls.slice(-2), ['rollback', 'close']);
  });
  for (const expected of ['rv1:0000000000000002', 'opaque-memory-version', 'RV1:0000000000000001']) {
    test(`${spec.name}: valid opaque/stale version conflicts before UPDATE (${expected})`, async () => {
      const f = fake(() => [spec.row]);
      await assert.rejects(f.run(spec.Repo, r => r.setEnabled(spec.id, version(expected), false)), code('VERSION_CONFLICT'));
      assert.equal(f.statements.length, 1); assert.equal(f.calls.includes('commit'), false);
    });
  }
  test(`${spec.name}: missing entity is NOT_FOUND, not a version codec error`, async () => {
    await assert.rejects(fake().run(spec.Repo, r => r.setEnabled(spec.id, version('opaque'), false)), code('NOT_FOUND'));
  });
  test(`${spec.name}: concurrent RV change produces zero OUTPUT rows and VERSION_CONFLICT`, async () => {
    const f = fake((s, n) => n === 1 ? [spec.row] : []);
    await assert.rejects(f.run(spec.Repo, r => r.setEnabled(spec.id, oldVersion, false)), code('VERSION_CONFLICT'));
    assert.equal(f.statements.length, 2);
    assert.match(f.statements[1].text, /AND RV = @expectedVersion/);
  });
  test(`${spec.name}: overlapping writers with one expected version cannot both update`, async () => {
    let stored = structuredClone(spec.row), reads = 0, updates = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const f = fake(async s => {
      if (s.text.startsWith('SELECT')) {
        const snapshot = structuredClone(stored);
        if (++reads === 2) release();
        await gate; return [snapshot];
      }
      const expected = s.parameters.find(p => p.name === 'expectedVersion').value;
      if (Buffer.compare(Buffer.from(expected), Buffer.from(stored.RV)) !== 0) return [];
      updates++;
      stored = { ...stored, Enabled: s.parameters.find(p => p.name === 'enabled').value, RV: rv(2) };
      return [structuredClone(stored)];
    });
    const results = await Promise.allSettled([
      f.run(spec.Repo, r => r.setEnabled(spec.id, oldVersion, false)),
      f.run(spec.Repo, r => r.setEnabled(spec.id, oldVersion, true)),
    ]);
    assert.equal(updates, 1);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rejected = results.find(r => r.status === 'rejected');
    assert.equal(code('VERSION_CONFLICT')(rejected.reason), true);
    assert.equal(stored.Enabled, results.find(r => r.status === 'fulfilled').value.enabled);
  });
  test(`${spec.name}: failed UPDATE is infrastructure error, not VERSION_CONFLICT`, async () => {
    const f = fake((s, n) => { if (n === 1) return [spec.row]; throw new Error(secret); });
    await assert.rejects(f.run(spec.Repo, r => r.setEnabled(spec.id, oldVersion, false)), code('SQL_QUERY_FAILED'));
    assert.deepEqual(f.calls.slice(-2), ['rollback', 'close']);
  });
  test(`${spec.name}: setEnabled rejects a closed session before any UPDATE`, async () => {
    const f = fake(); let retained;
    await f.run(spec.Repo, async repo => { retained = repo; });
    await assert.rejects(retained.setEnabled(spec.id, oldVersion, false), code('SQL_SESSION_CLOSED'));
    assert.equal(f.statements.length, 0);
  });
  test(`${spec.name}: invalid L2 version is INVALID_VALUE, no write`, async () => {
    const f = fake(() => [spec.row]);
    await assert.rejects(f.run(spec.Repo, r => r.setEnabled(spec.id, '', false)), code('INVALID_VALUE'));
    assert.equal(f.statements.length, 1);
  });
}
test('Other read operations also reject expired sessions', async () => {
  for (const [Repo, method, args] of [
    [SqlFichaRepository, 'findByIds', ['ficha-A']],
    [SqlUserRepository, 'findByIdentity', [user().TenantId, user().DirectoryObjectId]],
    [SqlAssignmentRepository, 'listByUserAndFicha', ['user-A', 'ficha-A']],
  ]) {
    const f = fake(); let retained; await f.run(Repo, async r => { retained = r; });
    await assert.rejects(method === 'findByIds' ? retained[method](args) : retained[method](...args), code('SQL_SESSION_CLOSED'));
    assert.equal(f.statements.length, 0);
  }
});
test('Invalid input is rejected before SQL and never interpolated', async () => {
  for (const spec of specs) {
    const f = fake(); await assert.rejects(f.run(spec.Repo, r => r.findById("x';--")), code('SQL_CODEC_INVALID'));
    assert.equal(f.statements.length, 0);
  }
});

test('Assignment discovery: user scoped, typed, ordered, no filtering of validity or enabled state',async()=>{
  const f=fake(()=>[assignment(),assignment({Id:'assignment-B',Enabled:true})]);
  const rows=await f.run(SqlAssignmentRepository,r=>r.listByUser('user-A'));
  assert.equal(rows.length,2);assert.equal(rows[0].enabled,false);
  assert.match(f.statements[0].text,/WHERE UserId = @userId ORDER BY InsertionOrder ASC;/);
  assert.deepEqual(f.statements[0].parameters,[{name:'userId',type:'varchar',length:64,value:'user-A'}]);
  assert.equal(await fake().run(SqlAssignmentRepository,async r=>(await r.listByUser('user-A')).length),0);
  let held;await f.run(SqlAssignmentRepository,async r=>{held=r;});
  await assert.rejects(held.listByUser('user-A'),code('SQL_SESSION_CLOSED'));
});
