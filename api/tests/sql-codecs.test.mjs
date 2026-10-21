import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../.local-build/infrastructure/sql/codecs.js';

function invalid(operation) { assert.throws(operation, { code: 'SQL_CODEC_INVALID' }); }
const report = { id: 'report-1', activityId: 'activity-1', period: '2026-🎓',
  quantity: '-0.000', narrative: 'Evidencia sintética: "a": y ñ', state: 'poc-draft',
  createdBy: 'user-1', createdAt: '0001-01-01T00:00:00.001Z',
  updatedBy: 'user-1', updatedAt: '9999-12-31T23:59:59.999Z', version: 'memory:opaque-1' };
const user = { id: 'user-1', tenantId: '12345678-1234-1234-1234-123456789abc',
  directoryObjectId: 'abcdefab-1234-1234-1234-123456789abc', alias: 'Sintético', enabled: true, version: 'old-v1' };
const assignment = { id: 'access-1', userId: 'user-1', fichaId: 'ficha-1', capability: 'poc:read',
  enabled: false, validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, version: 'old-v2' };

test('SQL codecs: IDs conservan caso, limites y rechazo sin truncar', () => {
  const codec = c.identifier('ficha');
  for (const value of ['A', 'a', 'A'.repeat(64), 'id-._2']) assert.equal(codec.decode(codec.encode(value)), value);
  for (const value of ['', 'A'.repeat(65), '_a', 'a b', 'ñ', 12, null, undefined]) invalid(() => codec.decode(value));
  invalid(() => codec.encode('x'.repeat(65)));
});
test('SQL codecs: GUID canonico en escritura y representacion del proveedor en lectura', () => {
  const codec = c.guid('tenant');
  assert.equal(codec.decode(user.tenantId.toUpperCase()), user.tenantId);
  assert.equal(codec.encode(user.tenantId), user.tenantId);
  for (const value of ['00000000-0000-0000-0000-000000000000', '{' + user.tenantId + '}', null]) invalid(() => codec.decode(value));
  invalid(() => codec.encode(user.tenantId.toUpperCase()));
});
test('SQL codecs: periodo UTF-16 y cadenas libres sin normalizacion', () => {
  const period = '😀'.repeat(64);
  assert.equal(c.period.decode(period), period);
  for (const value of ['x'.repeat(129), '\ud800', '\udc00', ' x', 'x\n']) invalid(() => c.period.decode(value));
  for (const value of ['', ' ñ 😀 ', 'a\u0000b', 'e\u0301']) assert.equal(c.unicodeText.decode(c.unicodeText.encode(value)), value);
  invalid(() => c.unicodeText.decode(12));
});
test('SQL codecs: decimal exacto mas alla de precision SQL y JS', () => {
  for (const value of ['-0', '-0.000', '0.00', '9'.repeat(200) + '.' + '0'.repeat(200), '9007199254740993.123456789']) {
    assert.equal(c.decimal.decode(c.decimal.encode(value)), value);
  }
  for (const value of [1, NaN, Infinity, '1e4', '+1', '.1', '00', '1.', null]) invalid(() => c.decimal.decode(value));
});
test('SQL codecs: UTC con milisegundos, sin interpretar cadenas locales', () => {
  for (const value of [report.createdAt, report.updatedAt, '2024-02-29T12:34:56.789Z']) {
    const sql = c.instant.encode(value);
    assert.equal(sql.toISOString(), value);
    assert.equal(c.instant.decode(sql), value);
    sql.setUTCFullYear(2030);
    assert.equal(typeof value, 'string');
  }
  for (const value of ['0000-01-01T00:00:00.000Z', '2025-02-29T00:00:00.000Z',
    '2026-01-01T00:00:00+00:00', '2026-01-01 00:00:00.000']) invalid(() => c.instant.encode(value));
  for (const value of [new Date(NaN), new Date('0000-01-01T00:00:00.000Z'), report.createdAt, null]) invalid(() => c.instant.decode(value));
});
test('SQL codecs: booleanos estrictos, null explicito y undefined rechazado', () => {
  for (const value of [true, false]) assert.equal(c.bit.decode(c.bit.encode(value)), value);
  for (const value of [0, 1, 'true', null, undefined]) invalid(() => c.bit.decode(value));
  const codec = c.nullable(c.decimal);
  assert.equal(codec.decode(null), null); assert.equal(codec.encode(null), null);
  assert.equal(codec.decode('0.00'), '0.00');
  invalid(() => codec.decode(undefined)); invalid(() => codec.encode(undefined));
});
test('SQL codecs: enums exactos, sin estados ni capacidades institucionales nuevas', () => {
  for (const [codec, values] of [[c.capability, ['poc:read', 'poc:edit-report']],
    [c.reportState, ['poc-draft', 'poc-blocked']], [c.operation, ['poc:create-report', 'poc:update-report']],
    [c.idempotencyState, ['poc:reserved', 'poc:completed']], [c.auditAction,
      ['poc:report-created', 'poc:report-updated', 'poc:user-enabled-changed', 'poc:assignment-enabled-changed']]]) {
    for (const value of values) assert.equal(codec.decode(codec.encode(value)), value);
    for (const value of ['approved', values[0] + ' ', values[0].toUpperCase(), null]) invalid(() => codec.decode(value));
  }
});
test('SQL codecs: claves y huellas reutilizan validadores L2', () => {
  assert.equal(c.correlation.decode('trace:1'), 'trace:1');
  assert.equal(c.idempotency.decode('K'.repeat(128)), 'K'.repeat(128));
  assert.equal(c.fingerprint.decode('a'.repeat(64)), 'a'.repeat(64));
  invalid(() => c.correlation.decode('x'.repeat(65)));
  invalid(() => c.idempotency.decode('x'.repeat(129)));
  invalid(() => c.fingerprint.decode('A'.repeat(64)));
});
test('SQL codecs: rowversion de ocho bytes, orden y copias defensivas', () => {
  const bytes = Buffer.from('0080ffffffffffff', 'hex');
  const token = c.rowversion.decode(bytes);
  assert.equal(token, 'rv1:0080ffffffffffff');
  const restored = c.rowversion.encode(token);
  assert.deepEqual([...restored], [...bytes]);
  restored[0] = 255;
  assert.equal(bytes[0], 0);
  for (const value of [new Uint8Array(7), new Uint8Array(9), '0080ffffffffffff', 1n]) invalid(() => c.rowversion.decode(value));
  for (const value of ['old-v1', 'rv1:FFFFFFFFFFFFFFFF', 'rv1:01']) invalid(() => c.rowversion.encode(value));
  assert.equal(c.historicalVersion.decode('old-v1'), 'old-v1');
});
test('SQL codecs: InsertionOrder bigint exacto y sin number', () => {
  for (const value of [1n, 9007199254740993n, 9223372036854775807n]) assert.equal(c.insertionOrder.decode(c.insertionOrder.encode(value)), value);
  for (const value of [1, '0', '-1', '01', '9223372036854775808', undefined]) invalid(() => c.insertionOrder.decode(value));
  invalid(() => c.insertionOrder.encode(1));
});
for (const [name, codec, value] of [['report', c.reportSnapshot, report], ['user', c.userSnapshot, user],
  ['assignment', c.assignmentSnapshot, assignment]]) {
  test(`SQL codecs: snapshot ${name} conserva todas las propiedades y version historica`, () => {
    assert.deepEqual(codec.decode(codec.encode(value)), value);
    assert.deepEqual(codec.decode(JSON.stringify(value, null, 2)), value);
    for (const invalidValue of [null, [], { ...value, version: ' ' }, { ...value, extra: 'x' }, { ...value, id: undefined }]) {
      invalid(() => codec.encode(invalidValue));
    }
    invalid(() => codec.decode('{"id":"incomplete"}'));
    invalid(() => codec.decode('{'));
    invalid(() => codec.decode(JSON.stringify(value).replace('{', '{"id":"duplicate",')));
    invalid(() => codec.decode(JSON.stringify(value).replace('{', '{"\\u0069d":"duplicate",')));
    const getter = { ...value };
    Object.defineProperty(getter, 'id', { get() { throw new Error('synthetic-secret'); } });
    invalid(() => codec.encode(getter));
  });
}
test('SQL codecs: snapshots rechazan tipos incorrectos y no revelan datos invalidos', () => {
  invalid(() => c.reportSnapshot.encode({ ...report, quantity: 0.1 }));
  invalid(() => c.reportSnapshot.encode({ ...report, state: 'approved' }));
  invalid(() => c.userSnapshot.encode({ ...user, enabled: 1 }));
  invalid(() => c.assignmentSnapshot.encode({ ...assignment, validUntil: undefined }));
  try { c.reportSnapshot.decode('C:\\Privado\\persona-ficticia'); }
  catch (error) {
    assert.equal(error.cause, undefined);
    assert.ok(!JSON.stringify(error).includes('persona-ficticia'));
    assert.equal(error.stack, undefined);
    assert.equal(Object.hasOwn(error, 'stack'), false);
  }
});

test('SQL codecs R1: rowversion ignora iteradores sobrescritos y conserva ocho bytes reales', () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 255]);
  bytes[Symbol.iterator] = function* () { yield 255; };
  assert.equal(c.rowversion.decode(bytes), 'rv1:00010203040506ff');
});

test('SQL codecs R1: byteLength aparente no permite rowversion de longitud invalida', () => {
  const bytes = new Uint8Array(1);
  Object.defineProperty(bytes, 'byteLength', { value: 8 });
  invalid(() => c.rowversion.decode(bytes));
});

test('SQL codecs R1: fecha interna invalida no se disfraza con metodos sobrescritos', () => {
  const bad = new Date(NaN);
  bad.getTime = () => 0;
  bad.toISOString = () => '2026-01-01T00:00:00.000Z';
  invalid(() => c.instant.decode(bad));
  const good = new Date('2026-01-01T01:02:03.456Z');
  good.getTime = () => NaN;
  good.toISOString = () => '2020-01-01T00:00:00.000Z';
  assert.equal(c.instant.decode(good), '2026-01-01T01:02:03.456Z');
});

test('SQL codecs R1: snapshots usan descriptores validados sin volver a consultar un Proxy', () => {
  let reads = 0;
  const proxy = new Proxy(report, { get(target, key) {
    reads++;
    return key === 'quantity' ? '1.25' : Reflect.get(target, key);
  } });
  assert.deepEqual(JSON.parse(c.reportSnapshot.encode(proxy)), report);
  assert.equal(reads, 0);
});
