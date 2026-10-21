import test from 'node:test';
import assert from 'node:assert/strict';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';
import { SqlInfrastructureError, sanitizeWorkError } from '../.local-build/infrastructure/sql/errors.js';
import { VersionConflictError } from '../.local-build/domain/errors.js';

const statement = () => ({ text: 'SELECT @value AS value', parameters: [{ name: 'value', type: 'nvarchar', value: 'synthetic' }] });
const marker = 'EMPRESA\\usuario.prueba C:\\Privado\\usuario.prueba PWD=ClaveFicticia-123';
function raw() { const e = new Error(marker); e.stack = marker; e.originalError = { message: marker }; return e; }
function fake(fail = [], gate = null) {
  const events = [], owners = [], inputs = [];
  const failures = new Set(fail);
  const tx = {
    async execute(input) { events.push('query'); inputs.push(input); owners.push(tx); if (gate) await gate;
      if (failures.has('query')) throw raw(); return [{ value: 'synthetic' }]; },
    async commit() { events.push('commit'); if (failures.has('commit')) throw raw(); },
    async rollback() { events.push('rollback'); if (failures.has('rollback')) throw raw(); },
  };
  const connection = {
    async begin(level) { assert.equal(level, 'SERIALIZABLE'); events.push('begin'); if (failures.has('begin')) throw raw(); return tx; },
    async close() { events.push('close'); if (failures.has('close')) throw raw(); },
  };
  const transport = { async connect() { events.push('connect'); if (failures.has('connect')) throw raw(); return connection; } };
  return { runner: new SqlSessionRunner(transport), events, owners, inputs };
}
function safe(error, code) {
  assert.equal(error.code, code); assert.equal(error.cause, undefined); assert.equal(error.originalError, undefined);
  assert.ok(!JSON.stringify(error).includes('usuario.prueba'));
  assert.equal(error.stack, undefined); assert.equal(Object.hasOwn(error, 'stack'), false);
  return true;
}
test('SQL sesion: commit explicito probado solo con doble y misma transaccion', async () => {
  const f = fake();
  const result = await f.runner.run('commit', async session => {
    const a = await session.execute(statement()); const b = await session.execute(statement()); return [a, b];
  });
  assert.equal(result.length, 2);
  assert.equal(f.owners[0], f.owners[1]);
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'query', 'commit', 'close']);
});
test('SQL sesion: modo rollback incluso si el callback termina correctamente', async () => {
  const f = fake();
  assert.equal(await f.runner.run('rollback', async session => (await session.execute(statement()))[0].value), 'synthetic');
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'rollback', 'close']);
});
for (const [stage, code] of [['connect', 'SQL_CONNECT_FAILED'], ['begin', 'SQL_BEGIN_FAILED'],
  ['query', 'SQL_QUERY_FAILED'], ['commit', 'SQL_COMMIT_OUTCOME_UNKNOWN'], ['rollback', 'SQL_ROLLBACK_FAILED'], ['close', 'SQL_CLOSE_FAILED']]) {
  test(`SQL sesion: fallo ${stage} sanitizado, sin reintentos`, async () => {
    const f = fake([stage]);
    await assert.rejects(f.runner.run(stage === 'rollback' ? 'rollback' : 'commit', async session => session.execute(statement())), e => safe(e, code));
    assert.equal(f.events.filter(e => e === stage).length, 1);
    if (stage !== 'connect') assert.equal(f.events.at(-1), 'close');
    if (['query', 'begin', 'rollback'].includes(stage)) assert.ok(!f.events.includes('commit'));
    if (stage === 'commit') assert.deepEqual(f.events.slice(-3), ['commit', 'rollback', 'close']);
  });
}
test('SQL sesion: fallo de consulta capturado por consumidor aun impide commit', async () => {
  const f = fake(['query']);
  await assert.rejects(f.runner.run('commit', async session => {
    await assert.rejects(session.execute(statement()), { code: 'SQL_QUERY_FAILED' });
    await assert.rejects(session.execute(statement()), { code: 'SQL_QUERY_FAILED' });
  }), e => safe(e, 'SQL_QUERY_FAILED'));
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'rollback', 'close']);
});
test('SQL sesion: rollback y cierre fallidos conservan fallo principal', async () => {
  const f = fake(['query', 'rollback', 'close']);
  await assert.rejects(f.runner.run('commit', async session => session.execute(statement())), e => safe(e, 'SQL_QUERY_FAILED'));
  assert.deepEqual(f.events.slice(-2), ['rollback', 'close']);
});
test('SQL sesion: excepcion del callback queda sanitizada y revierte', async () => {
  const f = fake(['rollback', 'close']);
  await assert.rejects(f.runner.run('commit', async () => { throw raw(); }), e => safe(e, 'SQL_WORK_FAILED'));
  assert.deepEqual(f.events, ['connect', 'begin', 'rollback', 'close']);
});
test('SQL sesion: uso posterior al cierre nunca ejecuta I/O', async () => {
  const f = fake(); let retained;
  await f.runner.run('rollback', async session => { retained = session; });
  await assert.rejects(retained.execute(statement()), e => safe(e, 'SQL_SESSION_CLOSED'));
  assert.deepEqual(f.events, ['connect', 'begin', 'rollback', 'close']);
});
test('SQL sesion: concurrencia rechazada y transaccion contaminada aunque se capture', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fake([], gate);
  await assert.rejects(f.runner.run('commit', async session => {
    const first = session.execute(statement());
    await assert.rejects(session.execute(statement()), { code: 'SQL_SESSION_BUSY' });
    release(); await first;
  }), e => safe(e, 'SQL_SESSION_BUSY'));
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'rollback', 'close']);
});
test('SQL sesion: consulta no esperada se drena antes de rollback y cierre', async () => {
  let release, callbackDone; const gate = new Promise(resolve => { release = resolve; });
  const done = new Promise(resolve => { callbackDone = resolve; }); const f = fake([], gate);
  let retained, settled = false;
  const run = f.runner.run('commit', async session => { retained = session; void session.execute(statement()); callbackDone(); });
  void run.finally(() => { settled = true; }).catch(() => {});
  await done; await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false); assert.ok(!f.events.includes('rollback'));
  await assert.rejects(retained.execute(statement()), { code: 'SQL_SESSION_CLOSED' });
  release();
  await assert.rejects(run, e => safe(e, 'SQL_SESSION_PENDING'));
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'rollback', 'close']);
});
test('SQL sesion: anidacion entre instancias no abre conexion y contamina al padre', async () => {
  const outer = fake(), inner = fake();
  await assert.rejects(outer.runner.run('commit', async () => {
    await assert.rejects(inner.runner.run('rollback', async () => {}), { code: 'SQL_SESSION_NESTED' });
  }), e => safe(e, 'SQL_SESSION_NESTED'));
  assert.deepEqual(inner.events, []); assert.deepEqual(outer.events, ['connect', 'begin', 'rollback', 'close']);
});
test('SQL sesion: dos invocaciones externas independientes no se consideran anidadas', async () => {
  const a = fake(), b = fake();
  await Promise.all([a.runner.run('rollback', async s => s.execute(statement())), b.runner.run('rollback', async s => s.execute(statement()))]);
  assert.equal(a.events.at(-1), 'close'); assert.equal(b.events.at(-1), 'close');
});
test('SQL sesion: no retiene parametros mutables del llamador', async () => {
  const f = fake();
  await f.runner.run('rollback', async s => {
    const input = statement(); const pending = s.execute(input); input.parameters[0].value = 'changed'; await pending;
  });
  assert.equal(f.inputs[0].parameters[0].value, 'synthetic');
});
test('SQL sesion: forma de finalizacion invalida rechazada antes de conectar', async () => {
  const f = fake();
  await assert.rejects(f.runner.run('auto', async () => {}), { code: 'SQL_WORK_FAILED' });
  assert.deepEqual(f.events, []);
});
test('SQL sesion: categorias publicas no admiten texto arbitrario', () => {
  const error = new SqlInfrastructureError(marker);
  assert.equal(error.code, 'SQL_WORK_FAILED'); assert.equal(error.stack, undefined);
});

test('SQL sesion: errores de dominio conocidos conservan su tipo sin mensajes contaminados', async () => {
  const f = fake(['rollback', 'close']);
  const error = new VersionConflictError(); error.message = marker; error.stack = marker;
  await assert.rejects(f.runner.run('commit', async () => { throw error; }), e => {
    assert.ok(e instanceof VersionConflictError);
    return safe(e, 'VERSION_CONFLICT');
  });
  assert.deepEqual(f.events, ['connect', 'begin', 'rollback', 'close']);
});

test('SQL sesion: tarea diferida tras finalizar no ejecuta consultas ni abre otra sesion', async () => {
  const f = fake(), nested = fake(); let delayed;
  await f.runner.run('rollback', async s => {
    delayed = new Promise(resolve => setImmediate(resolve)).then(async () => {
      await assert.rejects(s.execute(statement()), { code: 'SQL_SESSION_CLOSED' });
      await assert.rejects(nested.runner.run('rollback', async () => {}), { code: 'SQL_SESSION_NESTED' });
    });
  });
  await delayed;
  assert.deepEqual(nested.events, []);
  assert.deepEqual(f.events, ['connect', 'begin', 'rollback', 'close']);
});

test('SQL sesion R1: fachada inmutable no expone ni permite borrar el fallo interno', async () => {
  const f = fake(['query']);
  await assert.rejects(f.runner.run('commit', async s => {
    assert.deepEqual(Reflect.ownKeys(s), ['execute']);
    assert.equal(Object.isFrozen(s), true);
    for (const key of ['scope', 'transaction', 'finish', 'commit', 'rollback']) assert.equal(s[key], undefined);
    await assert.rejects(s.execute(statement()), { code: 'SQL_QUERY_FAILED' });
    assert.equal(Reflect.set(s, 'scope', { failure: undefined }), false);
    assert.equal(Reflect.set(s, 'execute', async () => []), false);
    await assert.rejects(s.execute(statement()), { code: 'SQL_QUERY_FAILED' });
  }), e => safe(e, 'SQL_QUERY_FAILED'));
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'rollback', 'close']);
});

test('SQL sesion R1: callback no puede sustituir finish para confirmar con consulta pendiente', async () => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const f = fake([], gate);
  const run = f.runner.run('commit', async s => {
    assert.equal(Reflect.set(s, 'finish', async () => {}), false);
    void s.execute(statement());
    entered();
  });
  await ready;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.events, ['connect', 'begin', 'query']);
  release();
  await assert.rejects(run, e => safe(e, 'SQL_SESSION_PENDING'));
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'rollback', 'close']);
});

test('SQL sesion R1: commit aplicado con respuesta perdida conserva resultado desconocido', async () => {
  const events = [];
  let applied = false;
  const tx = { execute: async () => [],
    commit: async () => { events.push('commit'); applied = true; throw raw(); },
    rollback: async () => { events.push('rollback'); } };
  const runner = new SqlSessionRunner({ connect: async () => ({
    begin: async () => tx, close: async () => { events.push('close'); },
  }) });
  await assert.rejects(runner.run('commit', async () => {}), e => {
    safe(e, 'SQL_COMMIT_OUTCOME_UNKNOWN');
    assert.equal(e.transactionOutcome, 'unknown');
    assert.match(e.message, /No se conoce el resultado/);
    return true;
  });
  assert.equal(applied, true);
  assert.deepEqual(events, ['commit', 'rollback', 'close']);
});

test('SQL sesion R1: limpieza fallida no oculta ambiguedad ni un commit confirmado', async () => {
  const uncertain = fake(['commit', 'rollback', 'close']);
  await assert.rejects(uncertain.runner.run('commit', async () => {}), e => {
    safe(e, 'SQL_COMMIT_OUTCOME_UNKNOWN');
    return e.transactionOutcome === 'unknown';
  });
  const confirmed = fake(['close']);
  await assert.rejects(confirmed.runner.run('commit', async () => {}), e => {
    safe(e, 'SQL_CLOSE_FAILED');
    return e.transactionOutcome === 'committed';
  });
  assert.deepEqual(confirmed.events, ['connect', 'begin', 'commit', 'close']);
});

test('SQL sesion R1: errores desconocidos hostiles no exponen excepciones ni stack', async () => {
  const hostile = new Proxy({}, { getPrototypeOf() { throw raw(); } });
  safe(sanitizeWorkError(hostile), 'SQL_WORK_FAILED');
  const f = fake();
  await assert.rejects(f.runner.run('rollback', async () => { throw hostile; }), e => safe(e, 'SQL_WORK_FAILED'));
  assert.deepEqual(f.events, ['connect', 'begin', 'rollback', 'close']);
});

test('SQL sesion R1: modificar el error recibido no altera ni contamina el fallo retenido', async () => {
  const f = fake(['query', 'rollback', 'close']);
  await assert.rejects(f.runner.run('commit', async s => {
    try { await s.execute(statement()); }
    catch (e) { e.code = 'SQL_WORK_FAILED'; e.message = marker; e.stack = marker; e.cause = marker; }
  }), e => safe(e, 'SQL_QUERY_FAILED'));
  assert.deepEqual(f.events, ['connect', 'begin', 'query', 'rollback', 'close']);
});
