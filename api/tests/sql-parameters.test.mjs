import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { validateSqlParameter as validate, validateSqlStatement, prepareMssqlOdbcParameters as prepare,
  mssqlOdbcBindingIssue as issue } from '../.local-build/infrastructure/sql/parameters.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';

const guid = '12345678-1234-1234-1234-123456789abc';
const param = (type, value, metadata = {}) => ({ name: 'p', type, value, ...metadata });
function invalid(work) {
  assert.throws(work, e => e.code === 'SQL_CODEC_INVALID' && e.stack === undefined && e.cause === undefined);
}
const examples = [param('varchar', 'ASCII', { length: 64 }), param('nvarchar', 'ñ😀', { length: 3 }),
  param('uniqueidentifier', guid), param('datetime2', new Date('2026-01-01T01:02:03.123Z'), { scale: 3 }),
  param('bit', false), param('bigint', '-9223372036854775808'),
  param('decimal', '9007199254740993.123456789', { precision: 38, scale: 9 }),
  param('numeric', '-0.000', { precision: 3, scale: 3 }),
  param('binary', Buffer.alloc(8), { length: 8 }), param('varbinary', new Uint8Array(), { length: 8 })];

for (const example of examples) {
  test(`SQL descriptor: ${example.type}, metadatos, null y undefined`, () => {
    const result = validate(example);
    assert.equal(result.type, example.type);
    assert.equal(validate({ ...example, value: null }).value, null);
    invalid(() => validate({ ...example, value: undefined }));
    invalid(() => validate({ ...example, unexpected: 'synthetic' }));
    if (example.value instanceof Uint8Array) assert.deepEqual([...result.value], [...example.value]);
    else assert.deepEqual(example.value, result.value);
  });
}

test('SQL descriptor: compatibilidad de defaults existentes sin mutar el input', () => {
  for (const type of ['varchar', 'nvarchar']) assert.equal(validate(param(type, '')).length, 'max');
  assert.equal(validate(param('binary', new Uint8Array(8))).length, 8);
  assert.equal(validate(param('datetime2', new Date('2026-01-01T00:00:00.001Z'))).scale, 3);
  const input = param('nvarchar', 'synthetic'); validate(input); assert.equal(Object.hasOwn(input, 'length'), false);
  invalid(() => validate({ ...input, length: undefined }));
});
test('SQL descriptor: longitudes SQL y unidades UTF-16 sin truncar', () => {
  assert.equal(validate(param('nvarchar', '😀'.repeat(2000), { length: 4000 })).value.length, 4000);
  assert.equal(validate(param('varchar', 'x'.repeat(8000), { length: 8000 })).value.length, 8000);
  for (const [type, max] of [['nvarchar', 4000], ['varchar', 8000], ['varbinary', 8000], ['binary', 8000]]) {
    const value = type.includes('binary') ? null : '';
    for (const length of [0, -1, 0.5, max + 1, NaN, Infinity, '8', undefined]) invalid(() => validate(param(type, value, { length })));
    if (type !== 'binary') assert.equal(validate(param(type, value, { length: 'max' })).length, 'max');
  }
  invalid(() => validate(param('binary', null, { length: 'max' })));
  invalid(() => validate(param('nvarchar', '😀', { length: 1 })));
  invalid(() => validate(param('varchar', 'ñ', { length: 8 })));
});
test('SQL descriptor: bigint exacto en ambos limites, nunca number', () => {
  for (const value of ['-9223372036854775808', '9223372036854775807', '9007199254740993', '0', '-0']) {
    assert.equal(validate(param('bigint', value)).value, value);
  }
  for (const value of ['-9223372036854775809', '9223372036854775808', '01', '+1', '1e3', '1.0', 1, 1n, true]) invalid(() => validate(param('bigint', value)));
});
test('SQL descriptor: precision y escala decimal sin redondeo ni conversion numerica', () => {
  for (const type of ['decimal', 'numeric']) {
    const maximum = '9'.repeat(38);
    assert.equal(validate(param(type, maximum, { precision: 38, scale: 0 })).value, maximum);
    assert.equal(validate(param(type, '0.' + '1'.repeat(38), { precision: 38, scale: 38 })).value.length, 40);
    for (const metadata of [{}, { precision: 0, scale: 0 }, { precision: 39, scale: 0 },
      { precision: 3.5, scale: 0 }, { precision: 3, scale: -1 }, { precision: 3, scale: 4 },
      { precision: 3, scale: 1.5 }, { precision: 3, scale: undefined }]) invalid(() => validate(param(type, null, metadata)));
    for (const value of ['100.00', '1.234', '1.2300', '01', '1e2', 1.23]) invalid(() => validate(param(type, value, { precision: 4, scale: 2 })));
  }
});
test('SQL descriptor: datetime2 escala 0..7, precision milisegundos y copias', () => {
  const date = new Date('2026-01-01T00:00:00.123Z');
  for (const scale of [3, 4, 5, 6, 7]) assert.equal(validate(param('datetime2', date, { scale })).value.toISOString(), date.toISOString());
  for (const scale of [-1, 8, 1.5, '3', undefined]) invalid(() => validate(param('datetime2', null, { scale })));
  invalid(() => validate(param('datetime2', date, { scale: 2 })));
  assert.equal(validate(param('datetime2', new Date('2026-01-01T00:00:00.120Z'), { scale: 2 })).value.getUTCMilliseconds(), 120);
  const result = validate(param('datetime2', date)); result.value.setUTCFullYear(2030);
  assert.equal(date.getUTCFullYear(), 2026);
  invalid(() => validate(param('datetime2', new Date(NaN))));
  invalid(() => validate(param('datetime2', date.toISOString())));
});
test('SQL descriptor: tipos, GUID, booleanos y metadatos incompatibles', () => {
  for (const input of [param('float', '1'), param('bit', 1), param('bit', 'false'),
    param('uniqueidentifier', guid.toUpperCase()), param('uniqueidentifier', 'invalid'),
    param('bit', true, { scale: 0 }), param('bigint', '1', { length: 8 }),
    param('nvarchar', 'a', { precision: 2 }), param('varbinary', Buffer.alloc(8))]) invalid(() => validate(input));
});
test('SQL descriptor: binarios fijos, variables, vacios y null son distintos', () => {
  const eight = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 255]);
  assert.equal(validate(param('binary', eight, { length: 8 })).value.length, 8);
  assert.equal(validate(param('varbinary', new Uint8Array(), { length: 8 })).value.length, 0);
  assert.equal(validate(param('varbinary', null, { length: 8 })).value, null);
  for (const value of [new Uint8Array(7), new Uint8Array(9), new Uint8Array(), '0x01']) invalid(() => validate(param('binary', value, { length: 8 })));
  invalid(() => validate(param('varbinary', new Uint8Array(9), { length: 8 })));
  const copied = validate(param('varbinary', eight, { length: 8 })).value; copied[0] = 99;
  assert.equal(eight[0], 0);
});
test('SQL descriptor: nombres seguros y duplicados ambiguos rechazados', () => {
  for (const name of ['', '@p', 'p;SELECT', 'p p', 'p'.repeat(128)]) invalid(() => validate({ ...examples[0], name }));
  invalid(() => validateSqlStatement({ text: 'SELECT @p', parameters: [examples[0], { ...examples[0], name: 'P' }] }));
  invalid(() => prepare([examples[0], { ...examples[0], name: 'P' }]));
  invalid(() => prepare({ length: 0 }));
  invalid(() => validateSqlStatement({ text: ' ', parameters: [] }));
  invalid(() => validateSqlStatement({ text: 'SELECT 1', parameters: [undefined] }));
});
test('SQL descriptor: barrera ODBC rechaza decimal incluso null y binario null antes de input', () => {
  let calls = 0;
  const fake = { input() { calls++; } };
  function bind(parameters) { for (const parameter of prepare(parameters)) fake.input(parameter); }
  for (const type of ['decimal', 'numeric']) {
    for (const value of ['1.00', null]) {
      const input = param(type, value, { precision: 38, scale: 2 });
      assert.equal(issue(input), 'EXACT_DECIMAL_BINDING_UNAVAILABLE');
      invalid(() => bind([examples[0], { ...input, name: 'blocked' }]));
    }
  }
  for (const type of ['binary', 'varbinary']) {
    const input = param(type, null, { length: 8 });
    assert.equal(issue(input), 'BINARY_NULL_BINDING_UNSAFE'); invalid(() => bind([input]));
  }
  assert.equal(calls, 0);
  const [bytes] = prepare([{ ...examples[8], name: 'bytes' }]);
  assert.equal(Buffer.isBuffer(bytes.value), true); assert.equal(bytes.value.length, 8);
  assert.equal(issue(examples[9]), 'EMPTY_BINARY_BINDING_UNSAFE');
  invalid(() => bind([{ ...examples[8], name: 'bytes' }, { ...examples[9], name: 'empty' }]));
  assert.equal(calls, 0);
});

test('SQL ODBC R4: vacio y null rechazados; descriptor distingue vacio sin mutarlo', () => {
  for (const type of ['binary', 'varbinary']) {
    for (const value of [Buffer.alloc(0), new Uint8Array(), null]) {
      const input = param(type, value, { length: 8 });
      invalid(() => prepare([input]));
      assert.equal(input.value, value);
      if (value !== null) assert.equal(value.length, 0);
    }
  }
  const empty = param('varbinary', Buffer.alloc(0), { length: 8 });
  assert.equal(validate(empty).value.length, 0);
  assert.equal(issue(empty), 'EMPTY_BINARY_BINDING_UNSAFE');
});

test('SQL ODBC R4: tres y ocho bytes exactos con copia defensiva, sin mutar el Buffer', () => {
  for (const size of [3, 8]) {
    const original = Buffer.from(Array.from({ length: size }, (_, i) => i + 1));
    for (const type of ['binary', 'varbinary']) {
      const input = param(type, original, { length: size });
      const [result] = prepare([input]);
      assert.ok(Buffer.isBuffer(result.value)); assert.notEqual(result.value, original);
      assert.deepEqual(result.value, original);
      result.value.fill(255);
      assert.deepEqual([...original], Array.from({ length: size }, (_, i) => i + 1));
    }
  }
});
test('SQL descriptor: fallo validado en sesion no llega al doble ni permite commit', async () => {
  const events = [];
  const tx = { execute: async () => { events.push('query'); return []; }, commit: async () => { events.push('commit'); }, rollback: async () => { events.push('rollback'); } };
  const runner = new SqlSessionRunner({ connect: async () => ({ begin: async () => tx, close: async () => { events.push('close'); } }) });
  await assert.rejects(runner.run('commit', async session => {
    await assert.rejects(session.execute({ text: 'SELECT @p', parameters: [param('bit', 'false')] }), { code: 'SQL_QUERY_FAILED' });
  }), { code: 'SQL_QUERY_FAILED' });
  assert.deepEqual(events, ['rollback', 'close']);
});
test('SQL descriptor: propiedades desconocidas, accesores y errores no publican secretos', () => {
  const input = { ...examples[0] }; Object.defineProperty(input, 'value', { get() { throw new Error('synthetic-secret'); } });
  invalid(() => validate(input));
  invalid(() => validate(new Proxy({}, { getPrototypeOf() { throw new Error('synthetic-secret'); } })));
});
test('SQL descriptor: evidencia del cast instalado aislado sin importar binding nativo', async () => {
  const source = await readFile(new URL('../node_modules/mssql/lib/msnodesqlv8/request.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('const castParameter = function'), source.indexOf('const createColumns'));
  assert.ok(body.startsWith('const castParameter'));
  const TYPES = new Proxy({}, { get(target, name) { return target[name] ??= Symbol(name); } });
  const cast = vm.runInNewContext(body + '\ncastParameter', { TYPES, Buffer, EMPTY_BUFFER: Buffer.alloc(0) }, { timeout: 100 });
  for (const type of [TYPES.Decimal, TYPES.Numeric]) {
    const value = '9007199254740993.123456789'; const converted = cast(value, type);
    assert.equal(typeof converted, 'number'); assert.notEqual(String(converted), value);
  }
  for (const type of [TYPES.Binary, TYPES.VarBinary]) {
    for (const value of [null, undefined, Buffer.alloc(0)]) assert.equal(cast(value, type).length, 0);
    const value = Buffer.alloc(8, 255); assert.deepEqual(cast(value, type), value);
    assert.notDeepEqual(cast(new Uint8Array([1, 2]), type), Buffer.from([1, 2]));
  }
});


test('SQL descriptor: union discriminada verificada por TypeScript sin archivos emitidos', () => {
  const configPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, fileURLToPath(new URL('../', import.meta.url)));
  const apiRoot = fileURLToPath(new URL('../', import.meta.url));
  const options = { ...config.options, noEmit: true, noUnusedLocals: false,
    typeRoots: [fileURLToPath(new URL('../node_modules/@types/', import.meta.url))] };
  const filename = fileURLToPath(new URL('../src/infrastructure/sql/__descriptor_probe__.ts', import.meta.url));
  const source = `import type { SqlParameter } from './parameters.js';
    const legacy: SqlParameter = { name: 'p', type: 'nvarchar', value: 'x' };
    const decimal: SqlParameter = { name: 'p', type: 'decimal', value: '1.00', precision: 38, scale: 2 };
    const binary: SqlParameter = { name: 'p', type: 'varbinary', value: null, length: 8 };
    // @ts-expect-error decimal requiere precision y escala
    const bad1: SqlParameter = { name: 'p', type: 'decimal', value: '1' };
    // @ts-expect-error bigint nunca acepta number
    const bad2: SqlParameter = { name: 'p', type: 'bigint', value: 1 };
    // @ts-expect-error varbinary requiere longitud
    const bad3: SqlParameter = { name: 'p', type: 'varbinary', value: null };
    // @ts-expect-error bit no admite longitud
    const bad4: SqlParameter = { name: 'p', type: 'bit', value: true, length: 8 };
    // @ts-expect-error no se admiten tipos SQL arbitrarios
    const bad5: SqlParameter = { name: 'p', type: 'float', value: 1 };
  `;
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => apiRoot;
  const original = host.getSourceFile.bind(host);
  const same = file => file.replaceAll('\\', '/').toLowerCase() === filename.replaceAll('\\', '/').toLowerCase();
  const exists = host.fileExists.bind(host);
  host.fileExists = file => same(file) || exists(file);
  host.getSourceFile = (file, languageVersion, ...rest) => same(file)
    ? ts.createSourceFile(file, source, languageVersion, true) : original(file, languageVersion, ...rest);
  const program = ts.createProgram([filename], options, host);
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => diagnostic.code), []);
});
