import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest } from '@azure/functions';
import { createApplicationHandlers, createLocalQueryHandlers } from '../.local-build/composition/queries.js';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { reportTools } from '../.local-build/infrastructure/reportTools.js';
import { FichaAuthorizationService } from '../.local-build/application/authorization/service.js';
import { entityId, version } from '../.local-build/domain/types.js';
import { configuration, objectId, signedToken, secondKey, harness } from './fixtures/identity.mjs';
import { fixtures, reportInput } from './fixtures/memory.mjs';

let originalFetch;
before(() => { originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Network disabled'); }; });
after(() => { globalThis.fetch = originalFetch; });

function setup(change = () => {}, decorate = c => c) {
  const f = fixtures();
  f.seed.users = f.seed.users.map((u, i) => ({ ...u, tenantId: entityId('tenant', configuration.tenantId),
    directoryObjectId: entityId('directory-object', i === 0 ? objectId : `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`) }));
  change(f);
  const memory = new MemoryUnitOfWork(f.seed);
  const work = { runAtomic: callback => memory.runAtomic(c => callback(decorate(c))) };
  const h = harness();
  const authorization = new FichaAuthorizationService(entityId('tenant', configuration.tenantId), h.clock, {
    // Convención únicamente de tests; no se habilita en composición local.
    isApplicable: (a, at) => a.validFrom <= at && (a.validUntil === null || at < a.validUntil),
  });
  const ids = [];
  const tools = { ...reportTools, id: kind => {
    const id = entityId(kind, `synthetic-${kind}-${ids.length + 1}`);
    ids.push({ kind, id }); return id;
  } };
  const handlers = createApplicationHandlers(h.validator, work, authorization, h.clock, tools);
  const body = { period: 'synthetic-period', quantity: '1.000', narrative: 'Contenido sintético' };
  const token = (index = 0, overrides = {}, key) => signedToken({ oid: f.seed.users[index].directoryObjectId, ...overrides }, {}, key);
  function request(method, jwt, id, input, key = 'synthetic-key', extra = {}) {
    return new HttpRequest({ method, url: 'http://127.0.0.1:7071/api/poc/fixture',
      params: { [method === 'POST' ? 'activityId' : 'reportId']: id },
      headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': key }) },
      ...(input === undefined ? {} : { body: { string: JSON.stringify(input) } }), ...extra });
  }
  const post = (jwt, input = body, key, id = f.seed.activities[0].id, extra) => handlers.createReport(request('POST', jwt, id, input, key, extra));
  const patch = (jwt, id, input, key, extra) => handlers.updateReport(request('PATCH', jwt, id, input, key, extra));
  const get = (jwt, id, extra) => handlers.getReport(request('GET', jwt, id, undefined, undefined, extra));
  const events = () => memory.runAtomic(async c => (await Promise.all(ids.filter(x => x.kind === 'audit-event').map(x => c.audit.findById(x.id)))).filter(Boolean));
  const scope = (operation, key = 'synthetic-key') => ({ actorId: f.alpha, operation, key });
  return { f, h, memory, handlers, ids, tools, body, token, request, post, patch, get, events, scope };
}
function error(response, status, jwt) {
  assert.equal(response.status, status);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.ok(response.jsonBody.error.code);
  const text = JSON.stringify(response);
  for (const forbidden of ['synthetic-sensitive', 'stack', ...(jwt ? [jwt] : [])]) assert.ok(!text.includes(forbidden));
}

for (const method of ['GET', 'POST', 'PATCH']) {
  test(`L7-B2 HTTP ${method}: ID 64 autorizado, 65 inválido, sin token 401`, async () => {
    const target = 'R'.repeat(64);
    const s = setup(f => {
      if (method === 'POST') f.seed.activities[0].id = target;
      else f.seed.reports = [{ ...reportInput(f), id: target, version: version('initial') }];
    });
    const jwt = await s.token();
    const input = method === 'POST' ? s.body : method === 'PATCH' ? { expectedVersion: 'initial', narrative: 'Cambio' } : undefined;
    const handler = s.handlers[method === 'POST' ? 'createReport' : method === 'PATCH' ? 'updateReport' : 'getReport'];
    assert.equal((await handler(s.request(method, jwt, target, input))).status, method === 'POST' ? 201 : 200);
    error(await handler(s.request(method, jwt, target + 'R', input)), 400, jwt);
    error(await handler(s.request(method, null, target + 'R', input)), 401);
    error(await handler(s.request(method, await s.token(1), target, input)), 404);
  });
}

test('L7-B2 HTTP periodo UTF-16: 128 válido con replay y sustitutos aislados rechazados', async () => {
  const s = setup(); const jwt = await s.token();
  const body = { ...s.body, period: '😀'.repeat(64) };
  const response = await s.post(jwt, body);
  assert.equal(response.status, 201);
  assert.deepEqual(await s.post(jwt, body), response);
  assert.equal((await s.events()).length, 1);
  for (const period of ['a'.repeat(127) + '😀', '\ud800', '\udc00']) {
    error(await s.post(jwt, { ...s.body, period }, 'another-key'), 400, jwt);
  }
  assert.equal((await s.events()).length, 1);
});

test('POST, PATCH y GET reales comparten memoria y mantienen DTO, autoría y snapshots', async () => {
  const s = setup(); const jwt = await s.token();
  const created = await s.post(jwt);
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(created.jsonBody.data).sort(), ['activityId', 'id', 'period', 'version']);
  const receipt = created.jsonBody.data;
  const fetched = await s.get(jwt, receipt.id);
  assert.equal(fetched.status, 200);
  assert.deepEqual(Object.keys(fetched.jsonBody.data).sort(), ['activityId', 'createdAt', 'id', 'narrative', 'period', 'quantity', 'state', 'updatedAt', 'version']);
  assert.equal(fetched.jsonBody.data.quantity, '1.000');
  assert.equal(fetched.jsonBody.data.state, 'poc-draft');
  s.h.advance(1000);
  const updated = await s.patch(jwt, receipt.id, { expectedVersion: receipt.version, narrative: 'Corrección' });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.jsonBody.data.version, receipt.version);
  const persisted = await s.memory.runAtomic(c => c.reports.findById(receipt.id));
  assert.equal(persisted.createdBy, s.f.alpha); assert.equal(persisted.updatedBy, s.f.alpha);
  assert.equal(persisted.createdAt, s.f.now); assert.notEqual(persisted.updatedAt, s.f.now);
  assert.equal(persisted.quantity, '1.000');
  const events = await s.events();
  assert.equal(events.length, 2);
  assert.equal(events[0].change.action, 'poc:report-created');
  assert.equal(events[0].change.before, null);
  assert.deepEqual(events[1].change.before, events[0].change.after);
  assert.deepEqual(events[1].change.after, persisted);
  assert.equal((await s.handlers.ficha(new HttpRequest({ method: 'GET', url: 'http://127.0.0.1/api/poc/fichas/a',
    params: { fichaId: s.f.fichaAlpha }, headers: { Authorization: `Bearer ${jwt}` } }))).status, 200);
});
test('PATCH distingue omisión de quantity frente a null y conserva el decimal exacto', async () => {
  const s = setup(); const jwt = await s.token(); let r = (await s.post(jwt)).jsonBody.data;
  r = (await s.patch(jwt, r.id, { expectedVersion: r.version, narrative: '' }, 'patch-one')).jsonBody.data;
  assert.equal((await s.get(jwt, r.id)).jsonBody.data.quantity, '1.000');
  r = (await s.patch(jwt, r.id, { expectedVersion: r.version, quantity: null }, 'patch-two')).jsonBody.data;
  const dto = (await s.get(jwt, r.id)).jsonBody.data;
  assert.equal(dto.quantity, null); assert.equal(dto.narrative, '');
});
test('POST acepta quantity null sin convertirlo en cero', async () => {
  const s = setup(); const jwt = await s.token(); const r = await s.post(jwt, { ...s.body, quantity: null });
  assert.equal(r.status, 201); assert.equal((await s.get(jwt, r.jsonBody.data.id)).jsonBody.data.quantity, null);
});
for (const label of ['sin token', 'firma inválida', 'azp no permitido', 'sin usuario', 'sin capacidad', 'acceso cruzado']) {
  test(`POST/PATCH/GET: ${label} no accede ni revela recursos`, async () => {
    const s = setup(); const owner = await s.token(); const r = (await s.post(owner)).jsonBody.data;
    let jwt;
    if (label === 'firma inválida') jwt = await s.token(0, {}, secondKey.privateKey);
    else if (label === 'azp no permitido') jwt = await s.token(0, { azp: '99999999-9999-4999-8999-999999999999' });
    else if (label === 'sin usuario') jwt = await s.token(0, { oid: '99999999-9999-4999-8999-999999999999' });
    else if (label === 'sin capacidad') jwt = await s.token(2);
    else if (label === 'acceso cruzado') jwt = await s.token(1);
    const status = ['sin token', 'firma inválida', 'azp no permitido'].includes(label) ? 401 : 404;
    error(await s.post(jwt, { ...s.body, period: 'other-period' }), status, jwt);
    error(await s.patch(jwt, r.id, { expectedVersion: r.version, narrative: 'Ataque' }), status, jwt);
    // Consultor tiene lectura explícita, aunque no edición.
    if (label === 'sin capacidad') assert.equal((await s.get(jwt, r.id)).status, 200);
    else error(await s.get(jwt, r.id), status, jwt);
    assert.equal((await s.events()).length, 1);
  });
}
test('capacidad de edición no implica lectura del reporte', async () => {
  const s = setup(f => { f.seed.assignments = f.seed.assignments.filter(a => a.capability === 'poc:edit-report'); });
  const jwt = await s.token(); const r = await s.post(jwt);
  assert.equal(r.status, 201); error(await s.get(jwt, r.jsonBody.data.id), 404);
});
test('actividad/reporte inexistentes y recursos ajenos producen el mismo 404', async () => {
  const s = setup(); const jwt = await s.token();
  assert.deepEqual(await s.post(jwt, s.body, undefined, 'missing'), await s.post(jwt, s.body, undefined, s.f.seed.activities[2].id));
  error(await s.get(jwt, 'missing'), 404);
  error(await s.patch(jwt, 'missing', { expectedVersion: 'v', quantity: null }), 404);
});
test('poc-blocked no se edita y no se cambia su estado', async () => {
  const s = setup(f => { f.seed.reports = [{ ...reportInput(f), state: 'poc-blocked', version: version('blocked-v') }]; });
  const jwt = await s.token();
  error(await s.patch(jwt, 'synthetic-report', { expectedVersion: 'blocked-v', narrative: 'change' }), 409);
  assert.equal((await s.get(jwt, 'synthetic-report')).jsonBody.data.state, 'poc-blocked');
  assert.equal((await s.events()).length, 0);
});
test('versión obsoleta no sobrescribe ni deja auditoría o idempotencia', async () => {
  const s = setup(); const jwt = await s.token(); const r = (await s.post(jwt)).jsonBody.data;
  error(await s.patch(jwt, r.id, { expectedVersion: 'stale', narrative: 'change' }), 409);
  assert.equal((await s.get(jwt, r.id)).jsonBody.data.version, r.version);
  assert.equal((await s.events()).length, 1);
  assert.equal(await s.memory.runAtomic(c => c.idempotency.findByScope(s.scope('poc:update-report'))), null);
});
test('creaciones concurrentes con distinta clave: una confirma y otra encuentra duplicado', async () => {
  const s = setup(); const jwt = await s.token();
  const results = await Promise.all([s.post(jwt, s.body, 'one'), s.post(jwt, s.body, 'two')]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal((await s.events()).length, 1);
});
test('PATCH concurrentes con la misma versión: una confirma, sin actualización perdida', async () => {
  const s = setup(); const jwt = await s.token(); const r = (await s.post(jwt)).jsonBody.data;
  const results = await Promise.all([s.patch(jwt, r.id, { expectedVersion: r.version, narrative: 'one' }, 'one'),
    s.patch(jwt, r.id, { expectedVersion: r.version, narrative: 'two' }, 'two')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal((await s.events()).length, 2);
});
test('POST repetido y concurrente conserva resultado original sin auditoría duplicada', async () => {
  const s = setup(); const jwt = await s.token();
  const [one, two] = await Promise.all([s.post(jwt), s.post(jwt)]);
  assert.equal(one.status, 201); assert.deepEqual(two, one);
  const r = one.jsonBody.data;
  await s.patch(jwt, r.id, { expectedVersion: r.version, narrative: 'later' });
  const count = s.ids.length;
  assert.deepEqual(await s.post(jwt), one); assert.equal(s.ids.length, count);
  assert.equal((await s.events()).length, 2);
});
test('replay PATCH recupera versión original aun después de otra actualización', async () => {
  const s = setup(); const jwt = await s.token(); const r = (await s.post(jwt)).jsonBody.data;
  const command = { expectedVersion: r.version, quantity: '2.000' };
  const first = await s.patch(jwt, r.id, command, 'first');
  const second = await s.patch(jwt, r.id, { expectedVersion: first.jsonBody.data.version, narrative: 'later' }, 'second');
  assert.deepEqual(await s.patch(jwt, r.id, command, 'first'), first);
  assert.equal((await s.get(jwt, r.id)).jsonBody.data.version, second.jsonBody.data.version);
  assert.equal((await s.events()).length, 3);
});
test('clave incompatible por contenido, representación decimal u objetivo produce 409', async () => {
  const s = setup(); const jwt = await s.token(); await s.post(jwt);
  for (const body of [{ ...s.body, narrative: 'other' }, { ...s.body, quantity: '1.0' }, { ...s.body, period: 'other' }]) error(await s.post(jwt, body), 409);
  error(await s.post(jwt, s.body, undefined, s.f.seed.activities[1].id), 409);
  assert.equal((await s.events()).length, 1);
});
test('huella PATCH distingue omisión/null y versión esperada', async () => {
  const s = setup(); const jwt = await s.token(); const r = (await s.post(jwt)).jsonBody.data;
  const command = { expectedVersion: r.version, narrative: 'same' };
  const first = await s.patch(jwt, r.id, command);
  error(await s.patch(jwt, r.id, { ...command, quantity: null }), 409);
  error(await s.patch(jwt, r.id, { ...command, expectedVersion: first.jsonBody.data.version }), 409);
});
test('revocación deniega replays POST y PATCH aunque existan resultados guardados', async () => {
  const s = setup(); const jwt = await s.token(); const r = (await s.post(jwt)).jsonBody.data;
  const command = { expectedVersion: r.version, narrative: 'edited' }; await s.patch(jwt, r.id, command);
  const a = s.f.seed.assignments[1];
  await s.memory.runAtomic(c => c.assignments.setEnabled(a.id, a.version, false));
  error(await s.post(jwt), 404); error(await s.patch(jwt, r.id, command), 404);
  assert.equal((await s.events()).length, 2);
});

for (const operation of ['create', 'update']) for (const failure of ['audit', 'idempotency']) {
  test(`rollback ${operation} por fallo de ${failure} revierte todos los cambios y permite reintento`, async () => {
    let fail = false;
    const s = setup(() => {}, c => ({ ...c,
      audit: { ...c.audit, append: async event => { await c.audit.append(event); if (fail && failure === 'audit') throw new Error('synthetic-sensitive audit'); } },
      idempotency: { ...c.idempotency, complete: async (...args) => { const r = await c.idempotency.complete(...args); if (fail && failure === 'idempotency') throw new Error('synthetic-sensitive completion'); return r; } },
    }));
    const jwt = await s.token(); let r;
    if (operation === 'update') r = (await s.post(jwt)).jsonBody.data;
    const command = r ? { expectedVersion: r.version, narrative: 'edited' } : undefined;
    fail = true;
    error(r ? await s.patch(jwt, r.id, command) : await s.post(jwt), 500);
    assert.equal((await s.events()).length, r ? 1 : 0);
    const saved = await s.memory.runAtomic(c => c.reports.findByActivityAndPeriod(s.f.seed.activities[0].id, s.body.period));
    assert.equal(saved?.version ?? null, r?.version ?? null);
    assert.equal(await s.memory.runAtomic(c => c.idempotency.findByScope(s.scope(r ? 'poc:update-report' : 'poc:create-report'))), null);
    fail = false;
    assert.equal((r ? await s.patch(jwt, r.id, command) : await s.post(jwt)).status, r ? 200 : 201);
  });
}
test('memorias independientes y lecturas GET no comparten ni modifican escrituras', async () => {
  const one = setup(); const two = setup(); const jwt = await one.token(); const r = (await one.post(jwt)).jsonBody.data;
  const ids = one.ids.length; const events = await one.events();
  await one.get(jwt, r.id); await one.get(jwt, r.id);
  assert.equal(one.ids.length, ids); assert.deepEqual(await one.events(), events);
  error(await two.get(jwt, r.id), 404); assert.equal((await two.events()).length, 0);
});

test('validación POST: JSON, campos, tipos, claves, contenido y tamaños acotados', async () => {
  const s = setup(); const jwt = await s.token();
  for (const body of [null, [], {}, { ...s.body, quantity: 1 }, { ...s.body, quantity: '1e3' },
    { ...s.body, quantity: '' }, { ...s.body, period: null }, { ...s.body, narrative: null },
    { ...s.body, narrative: 'x'.repeat(4001) }, { ...s.body, quantity: '1'.repeat(129) },
    { ...s.body, state: 'poc-draft' }, { ...s.body, userId: s.f.beta }, { ...s.body, fichaId: s.f.fichaBeta },
    { ...s.body, createdBy: s.f.beta }, { ...s.body, createdAt: s.f.now }]) error(await s.post(jwt, body), 400);
  for (const key of ['', 'has space', 'x,y', 'x'.repeat(129)]) error(await s.post(jwt, s.body, key), 400);
  error(await s.post(jwt, s.body, undefined, undefined, { headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'text/plain' } }), 415);
  error(await s.post(jwt, s.body, undefined, undefined, { body: { string: '{invalid' } }), 400);
  error(await s.post(jwt, s.body, undefined, undefined, { body: { string: 'x'.repeat(16385) } }), 413);
  error(await s.post(jwt, s.body, undefined, undefined, { body: { string: 'é'.repeat(9000) } }), 413);
  error(await s.post(jwt, s.body, undefined, undefined, { headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'x', 'Content-Length': '17000' } }), 413);
  assert.equal((await s.events()).length, 0);
});
test('validación PATCH rechaza campos protegidos, null indebido, ausencia de versión y parche vacío', async () => {
  const s = setup(); const jwt = await s.token(); const r = (await s.post(jwt)).jsonBody.data;
  for (const body of [{ narrative: 'x' }, { expectedVersion: r.version }, { expectedVersion: null, quantity: null },
    { expectedVersion: r.version, narrative: null }, ...['state', 'period', 'activityId', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt'].map(key =>
      ({ expectedVersion: r.version, narrative: 'x', [key]: 'untrusted' }))]) error(await s.patch(jwt, r.id, body), 400);
  assert.equal((await s.events()).length, 1);
});
test('IDs inválidos, suplantación y fallo interno conservan respuestas controladas', async () => {
  const s = setup(); const jwt = await s.token();
  error(await s.post(jwt, s.body, undefined, '../other'), 400);
  error(await s.get(jwt, 'bad/id'), 400);
  error(await s.post(undefined, { invalid: true }), 401);
  const reader = await s.token(2);
  error(await s.post(reader, s.body, undefined, undefined, { headers: { Authorization: `Bearer ${reader}`,
    'X-User': s.f.alpha, 'X-Capability': 'poc:edit-report', 'Content-Type': 'application/json', 'Idempotency-Key': 'x' } }), 404);
  const broken = setup(() => {}, () => { throw new Error('synthetic-sensitive repository'); });
  error(await broken.post(await broken.token()), 500);
});
test('la composición sin configuración no habilita escrituras ni identidades ficticias', () => {
  for (const config of [undefined, '{}', '{invalid']) {
    const handlers = createLocalQueryHandlers(config);
    for (const name of ['createReport', 'getReport', 'updateReport']) error(handlers[name](), 500);
  }
});
