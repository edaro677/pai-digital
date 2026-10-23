import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { LocalOdbcTransport, localOdbcConfig, assertLocalSqlEnvironment } from '../.local-build/infrastructure/sql/odbc.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';

const secret = 'EMPRESA\\usuario.prueba usuario.prueba@ejemplo.test C:\\Privado\\usuario.prueba Password=ficticia';
const statement = { text: 'SELECT @text AS value', parameters: [{ name: 'text', type: 'nvarchar', length: 64, value: 'sintético' }] };
const localFunctions = Object.freeze({WEBSITE_HOSTNAME:'localhost:7071',PAI_POC_LOCAL_ONLY:'1',
  AZURE_FUNCTIONS_ENVIRONMENT:'Development',FUNCTIONS_WORKER_RUNTIME:'node',PAI_API_PERSISTENCE:'sql-local',
  AzureWebJobsStorage:'UseDevelopmentStorage=true'});

test('E2: standalone local diagnostics keep their existing environment contract',()=>assertLocalSqlEnvironment({}));
for(const host of ['localhost:7071','127.0.0.1:7071','[::1]:7071','localhost'])
  test(`E2: explicit independent local signals accept ${host}`,()=>assertLocalSqlEnvironment({...localFunctions,WEBSITE_HOSTNAME:host}));
for(const marker of ['WEBSITE_INSTANCE_ID','WEBSITE_SITE_NAME','IDENTITY_ENDPOINT','MSI_ENDPOINT','CONTAINER_APP_NAME','FUNCTIONS_WORKER_RUNTIME_VERSION'])
  test(`E2: hosted marker ${marker} overrides all local signals`,()=>{
    assert.throws(()=>assertLocalSqlEnvironment({...localFunctions,[marker]:'synthetic'}),{code:'SQL_CONNECT_FAILED'});
  });
for(const key of Object.keys(localFunctions))test(`E2: missing required signal ${key} rejects SQL`,()=>{
  const env={...localFunctions};delete env[key];
  assert.throws(()=>assertLocalSqlEnvironment(env),{code:'SQL_CONNECT_FAILED'});
});
for(const patch of [{WEBSITE_HOSTNAME:'remote.example.test'}, {WEBSITE_HOSTNAME:'localhost.attacker.test'},
  {WEBSITE_HOSTNAME:'127.0.0.1:65536'}, {WEBSITE_HOSTNAME:'localhost:0'}, {NODE_ENV:'production'},
  {AZURE_FUNCTIONS_ENVIRONMENT:'Production'}, {FUNCTIONS_WORKER_RUNTIME:'python'},
  {PAI_API_PERSISTENCE:'memory'}, {PAI_POC_LOCAL_ONLY:'true'},
  {AzureWebJobsStorage:'synthetic-sensitive-connection'}, {azurewebjobsstorage:'duplicate'}])
  test(`E2: inconsistent local signals are denied (${Object.keys(patch)[0]}:${String(Object.values(patch)[0])})`,()=>{
    assert.throws(()=>assertLocalSqlEnvironment({...localFunctions,...patch}),e=>{
      assert.equal(e.code,'SQL_CONNECT_FAILED');assert.equal(e.stack,undefined);
      assert.doesNotMatch(JSON.stringify(e),/synthetic-sensitive-connection/);return true;
    });
  });
test('E2: NODE_ENV and loopback hostname alone are insufficient',()=>{
  assert.throws(()=>assertLocalSqlEnvironment({NODE_ENV:'development',WEBSITE_HOSTNAME:'localhost:7071'}),{code:'SQL_CONNECT_FAILED'});
});
function setup(fail = [], options = {}) {
  const calls = [], records = [];
  let bindings = [], loadCount = 0;
  const error = Object.assign(new Error(secret), { code: 'ETIMEOUT', originalError: secret });
  const step = name => { calls.push(name); if (fail.includes(name)) throw error; };
  class Pool {
    constructor(config) { calls.push(['config', config]); }
    on(_event, listener) { this.listener = listener; }
    async connect() { step('connect'); }
    async close() { step('close'); }
  }
  class Transaction {
    constructor(pool) { assert.ok(pool instanceof Pool); }
    async begin(isolation) { assert.equal(isolation, 4); step('begin'); }
    async commit() { step('commit'); }
    async rollback() { step('rollback'); }
  }
  class Request {
    constructor(owner) { assert.ok(owner instanceof Transaction); step('request'); }
    input(name, type, value) { bindings.push({ name, type, value }); step('input'); return this; }
    async query(text) { calls.push(['sql', text]); step('query'); return { recordset: [{ value: 'synthetic' }] }; }
  }
  const factory = name => size => ({ name, size });
  const driver = { ConnectionPool: Pool, Transaction, Request, ISOLATION_LEVEL: { SERIALIZABLE: 4 }, MAX: 65535,
    VarChar: factory('varchar'), NVarChar: factory('nvarchar'), UniqueIdentifier: 'guid',
    DateTime2: factory('datetime2'), Bit: 'bit', BigInt: 'bigint', Binary: factory('binary'), VarBinary: factory('varbinary') };
  const transport = new LocalOdbcTransport({ loadDriver: async () => { loadCount++; step('load'); return driver; },
    ...options, onTrace: record => records.push(record) });
  return { transport, calls, bindings, records, get loads() { return loadCount; } };
}
test('ODBC: fixed local Windows/Shared Memory config, unchanged timeouts and lazy load', () => {
  const fixture = setup(); assert.equal(fixture.loads, 0);
  const config = localOdbcConfig();
  assert.equal(config.server, 'lpc:.\\PAIPOC'); assert.equal(config.database, 'pai_poc_dev');
  assert.equal(config.connectionTimeout, 10000); assert.equal(config.requestTimeout, 10000);
  assert.equal(config.pool.acquireTimeoutMillis, 10000); assert.equal(config.pool.max, 1);
  assert.equal(config.options.trustedConnection, true); assert.equal(config.options.useUTC, true);
  assert.match(config.connectionString, /Trusted_Connection=Yes/); assert.doesNotMatch(config.connectionString, /Password|UID|PWD/i);
  config.server = 'remote'; assert.equal(localOdbcConfig().server, 'lpc:.\\PAIPOC');
});
test('ODBC: SERIALIZABLE, unchanged SQL and typed input, rollback then close', async () => {
  const f = setup();
  await new SqlSessionRunner(f.transport).run('rollback', session => session.execute(statement));
  assert.deepEqual(f.calls.filter(x => typeof x === 'string'), ['load', 'connect', 'begin', 'request', 'input', 'query', 'rollback', 'close']);
  assert.deepEqual(f.bindings, [{ name: 'text', type: { name: 'nvarchar', size: 64 }, value: 'sintético' }]);
  assert.deepEqual(f.calls.find(x => Array.isArray(x) && x[0] === 'sql'), ['sql', statement.text]);
  assert.deepEqual(f.records, []);
});
const allowed = [
  { name: 'p', type: 'varchar', value: 'technical', length: 'max' },
  { name: 'p', type: 'nvarchar', value: null },
  { name: 'p', type: 'uniqueidentifier', value: '11111111-1111-4111-8111-111111111111' },
  { name: 'p', type: 'datetime2', value: new Date('2026-01-01T00:00:00.123Z'), scale: 3 },
  { name: 'p', type: 'bit', value: false },
  { name: 'p', type: 'bigint', value: '9223372036854775807' },
  { name: 'p', type: 'binary', value: new Uint8Array(8) },
  { name: 'p', type: 'varbinary', value: Uint8Array.from([1, 2, 3]), length: 8 },
];
for (const parameter of allowed) test(`ODBC: explicit ${parameter.type} binding`, async () => {
  const f = setup();
  await new SqlSessionRunner(f.transport).run('rollback', s => s.execute({ text: 'SELECT @p', parameters: [parameter] }));
  assert.equal(f.bindings.length, 1);
  if (parameter.value instanceof Uint8Array) {
    assert.ok(Buffer.isBuffer(f.bindings[0].value)); assert.deepEqual([...f.bindings[0].value], [...parameter.value]);
  } else assert.deepEqual(f.bindings[0].value, parameter.value);
});
const blocked = [
  { name: 'p', type: 'decimal', value: '1.1', precision: 3, scale: 1 },
  { name: 'p', type: 'numeric', value: null, precision: 3, scale: 1 },
  { name: 'p', type: 'binary', value: null },
  { name: 'p', type: 'varbinary', value: null, length: 8 },
  { name: 'p', type: 'nvarchar', value: undefined },
  { name: 'p', type: 'nvarchar', value: 'too long', length: 1 },
  { name: 'p', type: 'bit', value: true, length: 1 },
  { name: 'p', type: 'binary', value: Buffer.alloc(0), length: 8 },
  { name: 'p', type: 'varbinary', value: Buffer.alloc(0), length: 8 },
];
for (const [index, parameter] of blocked.entries()) test(`ODBC: full barrier before ANY input ${index}`, async () => {
  const f = setup();
  await assert.rejects(new SqlSessionRunner(f.transport).run('rollback', s => s.execute({ text: 'SELECT @text', parameters: [...statement.parameters, parameter] })), { code: 'SQL_QUERY_FAILED' });
  assert.equal(f.bindings.length, 0); assert.ok(!f.calls.includes('request'));
  assert.ok(f.calls.includes('rollback')); assert.equal(f.calls.at(-1), 'close');
});
test('ODBC R4: rechazo vacio sanitizado, sin Request/input/query ni mutacion', async () => {
  for (const type of ['binary', 'varbinary']) {
    const original = Buffer.alloc(0), f = setup([], { trace: true });
    const connection = await f.transport.connect(); const tx = await connection.begin('SERIALIZABLE');
    try {
      await assert.rejects(tx.execute({ text: 'SELECT @text, @empty', parameters: [
        ...statement.parameters, { name: 'empty', type, length: 8, value: original },
      ] }), error => {
        assert.equal(error.code, 'SQL_QUERY_FAILED'); assert.equal(error.stack, undefined);
        assert.equal(error.cause, undefined); assert.ok(!JSON.stringify(error).includes(secret)); return true;
      });
    } finally { await tx.rollback(); await connection.close(); }
    assert.equal(original.length, 0); assert.equal(f.bindings.length, 0);
    for (const event of ['request', 'input', 'query']) assert.ok(!f.calls.includes(event));
    assert.ok(!JSON.stringify(f.records).includes(secret));
  }
});
for (const [failure, category] of [['connect', 'SQL_CONNECT_FAILED'], ['begin', 'SQL_BEGIN_FAILED'],
  ['query', 'SQL_QUERY_FAILED'], ['rollback', 'SQL_ROLLBACK_FAILED'], ['close', 'SQL_CLOSE_FAILED']]) {
  test(`ODBC: sanitized ${failure} and cleanup`, async () => {
    const f = setup([failure], { trace: true });
    await assert.rejects(new SqlSessionRunner(f.transport).run('rollback', s => s.execute(statement)), error => {
      assert.equal(error.code, category); assert.equal(error.stack, undefined);
      assert.ok(!JSON.stringify(error).includes(secret)); return true;
    });
    assert.ok(f.calls.includes('close'));
    assert.ok(!JSON.stringify(f.records).includes(secret));
    assert.ok(f.records.some(r => r.result === 'failed' && r.technicalCode === 'ETIMEOUT'));
  });
}
test('ODBC: query failure retained when rollback and close also fail', async () => {
  const f = setup(['query', 'rollback', 'close'], { trace: true });
  await assert.rejects(new SqlSessionRunner(f.transport).run('commit', s => s.execute(statement)), { code: 'SQL_QUERY_FAILED' });
  assert.ok(!f.calls.includes('commit')); assert.ok(f.calls.includes('rollback')); assert.ok(f.calls.includes('close'));
  assert.deepEqual(f.records.filter(r => r.result === 'failed').map(r => r.stage), ['QUERY', 'ROLLBACK', 'CLOSE']);
});
test('ODBC: successful commit only with doubles; failure has UNKNOWN outcome', async () => {
  const ok = setup(); await new SqlSessionRunner(ok.transport).run('commit', s => s.execute(statement));
  assert.ok(ok.calls.includes('commit')); assert.ok(!ok.calls.includes('rollback'));
  const bad = setup(['commit', 'close']);
  await assert.rejects(new SqlSessionRunner(bad.transport).run('commit', s => s.execute(statement)), { code: 'SQL_COMMIT_OUTCOME_UNKNOWN', transactionOutcome: 'unknown' });
  assert.ok(bad.calls.includes('close'));
});
test('ODBC: close failure after acknowledged commit retains committed outcome', async () => {
  const f = setup(['close']);
  await assert.rejects(new SqlSessionRunner(f.transport).run('commit', s => s.execute(statement)), { code: 'SQL_CLOSE_FAILED', transactionOutcome: 'committed' });
});
test('ODBC: explicit safe trace, frozen fields, non-authoritative observer', async () => {
  const f = setup([], { trace: true });
  await new SqlSessionRunner(f.transport).run('rollback', s => s.execute(statement));
  for (const r of f.records) {
    assert.ok(Object.isFrozen(r)); assert.ok(Number.isFinite(r.durationMs) && r.durationMs >= 0);
    assert.ok(Object.keys(r).every(k => ['stage', 'durationMs', 'result', 'category', 'technicalCode', 'connected', 'transactionActive'].includes(k)));
  }
  assert.equal(f.records.at(-1).connected, false); assert.equal(f.records.at(-1).transactionActive, false);
  const transport = new LocalOdbcTransport({ loadDriver: async () => { throw new Error(secret); }, trace: true,
    onTrace: () => { throw new Error(secret); } });
  await assert.rejects(transport.connect(), { code: 'SQL_CONNECT_FAILED' });
});
test('ODBC: rejects nested begin, post-close access and premature close', async () => {
  const f = setup(); const connection = await f.transport.connect(); const tx = await connection.begin('SERIALIZABLE');
  await assert.rejects(connection.begin('SERIALIZABLE'), { code: 'SQL_BEGIN_FAILED' });
  await assert.rejects(connection.close(), { code: 'SQL_CLOSE_FAILED' });
  await tx.rollback(); await connection.close(); await connection.close();
  await assert.rejects(tx.execute(statement), { code: 'SQL_SESSION_CLOSED' });
});
test('ODBC: module and health load with native library loading blocked', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    process.dlopen = () => { throw new Error('NATIVE_BLOCKED'); };
    await import('./.local-build/infrastructure/sql/odbc.js');
    await import('./.local-build/http/health.js');
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(child.status, 0, 'Neither health nor SQL module may load native code');
});
