import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { entityId } from '../.local-build/domain/types.js';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { FichaAuthorizationService } from '../.local-build/application/authorization/service.js';
import { ReadFichaQueries } from '../.local-build/application/queries/readFicha.js';
import { createFichaHandlers } from '../.local-build/http/fichas.js';
import { createLocalQueryHandlers } from '../.local-build/composition/queries.js';
import { health } from '../.local-build/http/health.js';
import { configuration, epoch, signedToken, secondKey, harness } from './fixtures/identity.mjs';
import { fixtures, reportInput, auditEvent, reservation } from './fixtures/memory.mjs';

let originalFetch;
before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network disabled in HTTP tests'); };
});
after(() => { globalThis.fetch = originalFetch; });

function setup(change = () => {}, validity) {
  const f = fixtures();
  f.seed.users = f.seed.users.map((u, i) => ({ ...u,
    tenantId: entityId('tenant', configuration.tenantId),
    directoryObjectId: entityId('directory-object', `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`),
  }));
  change(f);
  const h = harness();
  const work = new MemoryUnitOfWork(f.seed);
  // Supuesto temporal solo en tests; no se incorpora al arranque ni al build.
  const policy = validity ?? { isApplicable: (a, at) =>
    Date.parse(a.validFrom) <= Date.parse(at) && (a.validUntil === null || Date.parse(at) < Date.parse(a.validUntil)) };
  const authorization = new FichaAuthorizationService(entityId('tenant', configuration.tenantId), h.clock, policy);
  const handlers = createFichaHandlers(h.validator, new ReadFichaQueries(work, authorization));
  const token = (index = 0, overrides = {}, key) => signedToken({ oid: f.seed.users[index].directoryObjectId, ...overrides }, {}, key);
  function request(jwt, id = f.fichaAlpha, extra = {}) {
    return new HttpRequest({ method: 'GET', url: 'http://127.0.0.1:7071/api/poc/fichas/fixture',
      params: { fichaId: id }, headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, ...extra });
  }
  return { f, h, work, authorization, handlers, token, request };
}

function assertError(response, status, code, jwt) {
  assert.equal(response.status, status);
  assert.equal(response.jsonBody.error.code, code);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  const serialized = JSON.stringify(response);
  assert.ok(!serialized.includes('synthetic-sensitive'));
  assert.ok(!serialized.includes('stack'));
  if (jwt) assert.ok(!serialized.includes(jwt));
}

test('HTTP ficha autorizada: JWT real de prueba, L4-B y DTO con campos exactos', async () => {
  const s = setup(f => { f.seed.fichas[0].secret = 'synthetic-sensitive'; });
  const result = await s.handlers.ficha(s.request(await s.token()));
  assert.equal(result.status, 200);
  const { id, dependencyId, cycleLabel, version } = s.f.seed.fichas[0];
  assert.deepEqual(result.jsonBody, { data: { id, dependencyId, cycleLabel, version } });
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.match(result.headers['Content-Type'], /application\/json/);
});
test('HTTP actividades: únicamente filas ALFA y campos del contrato', async () => {
  const s = setup(f => { f.seed.activities[0].secret = 'synthetic-sensitive'; });
  const result = await s.handlers.actividades(s.request(await s.token()));
  assert.equal(result.status, 200);
  assert.deepEqual(result.jsonBody, { data: s.f.seed.activities.slice(0, 2).map(({ id, fichaId, description, version }) =>
    ({ id, fichaId, description, version })) });
});
test('HTTP actividades vacías es 200 para una ficha autorizada', async () => {
  const s = setup(f => { f.seed.activities = f.seed.activities.filter(a => a.fichaId !== f.fichaAlpha); });
  const result = await s.handlers.actividades(s.request(await s.token()));
  assert.deepEqual(result.jsonBody, { data: [] });
  assert.equal(result.status, 200);
});

for (const resource of ['ficha', 'actividades']) {
  test(`HTTP ${resource}: token ausente no consulta datos`, async () => {
    const s = setup();
    const noAccessWork = { runAtomic: () => { throw new Error('must not enter transaction'); } };
    const handler = createFichaHandlers(s.h.validator, new ReadFichaQueries(noAccessWork, s.authorization))[resource];
    const response = await handler(s.request());
    assertError(response, 401, 'UNAUTHENTICATED');
    assert.equal(response.headers['WWW-Authenticate'], 'Bearer');
  });
  test(`HTTP ${resource}: Bearer ambiguo o mal formado`, async () => {
    const s = setup(); const jwt = await s.token();
    for (const Authorization of [`Basic ${jwt}`, `Bearer ${jwt}, Bearer ${jwt}`, `Bearer  ${jwt}`, 'Bearer a.b.c']) {
      const result = await s.handlers[resource](s.request(null, undefined, { headers: { Authorization } }));
      assertError(result, 401, 'UNAUTHENTICATED', jwt);
    }
    const duplicates = new Headers();
    duplicates.append('Authorization', `Bearer ${jwt}`);
    duplicates.append('Authorization', `Bearer ${jwt}`);
    assertError(await s.handlers[resource](s.request(null, undefined, { headers: duplicates })), 401, 'UNAUTHENTICATED', jwt);
  });
  for (const [label, claims] of [
    ['expirado', { exp: epoch / 1000 - 31 }],
    ['audiencia ajena', { aud: '66666666-6666-4666-8666-666666666666' }],
    ['Graph', { aud: '00000003-0000-0000-c000-000000000000' }],
    ['ID token de SPA', { aud: '55555555-5555-4555-8555-555555555555', scp: undefined }],
    ['emisor ajeno', { iss: 'https://synthetic.invalid' }],
    ['tenant ajeno', { tid: '77777777-7777-4777-8777-777777777777' }],
    ['azp no permitido', { azp: '88888888-8888-4888-8888-888888888888' }],
    ['scope insuficiente', { scp: 'other.access' }],
  ]) test(`HTTP ${resource}: rechaza ${label}`, async () => {
    const s = setup(); const jwt = await s.token(0, claims);
    assertError(await s.handlers[resource](s.request(jwt)), 401, 'UNAUTHENTICATED', jwt);
  });
  test(`HTTP ${resource}: firma inválida`, async () => {
    const s = setup(); const jwt = await s.token(0, {}, secondKey.privateKey);
    assertError(await s.handlers[resource](s.request(jwt)), 401, 'UNAUTHENTICATED', jwt);
  });
  test(`HTTP ${resource}: sin asignación, capacidad insuficiente y usuario desconocido no revelan existencia`, async () => {
    for (const change of [
      f => { f.seed.assignments = []; },
      f => { f.seed.assignments = f.seed.assignments.filter(a => a.capability === 'poc:edit-report'); },
      f => { f.seed.users[0].enabled = false; },
    ]) {
      const s = setup(change);
      assertError(await s.handlers[resource](s.request(await s.token())), 404, 'NOT_FOUND');
    }
    const s = setup();
    assertError(await s.handlers[resource](s.request(await s.token(0, { oid: '99999999-9999-4999-8999-999999999999' }))), 404, 'NOT_FOUND');
  });
  test(`HTTP ${resource}: acceso cruzado e inexistencia producen respuestas idénticas`, async () => {
    const s = setup(); const jwt = await s.token();
    const cross = await s.handlers[resource](s.request(jwt, s.f.fichaBeta));
    const missing = await s.handlers[resource](s.request(jwt, 'missing-ficha'));
    assertError(cross, 404, 'NOT_FOUND');
    assert.deepEqual(cross, missing);
    assertError(await s.handlers[resource](s.request(await s.token(1), s.f.fichaAlpha)), 404, 'NOT_FOUND');
  });
  test(`HTTP ${resource}: identificadores inválidos y parámetros extra son 400 después de autenticar`, async () => {
    const s = setup(); const jwt = await s.token();
    for (const id of ['', 'with space', '../other', 'with\\slash', '%2F', 'a\n', 'x'.repeat(129), null]) {
      assertError(await s.handlers[resource](s.request(jwt, id)), 400, 'INVALID_REQUEST');
    }
    assertError(await s.handlers[resource](s.request(jwt, undefined, { params: {} })), 400, 'INVALID_REQUEST');
    assertError(await s.handlers[resource](s.request(jwt, undefined, { url: 'http://127.0.0.1/api/poc/fichas/a?userId=other' })), 400, 'INVALID_REQUEST');
    assertError(await s.handlers[resource](s.request(jwt, undefined, { method: 'POST', body: { string: '{}' } })), 400, 'INVALID_REQUEST');
    assertError(await s.handlers[resource](s.request(null, 'bad/id')), 401, 'UNAUTHENTICATED');
  });
  test(`HTTP ${resource}: encabezados de suplantación y roles no elevan permisos`, async () => {
    const s = setup(); const jwt = await s.token(1, { roles: ['Global Administrator'] });
    const result = await s.handlers[resource](s.request(null, s.f.fichaAlpha, { headers: {
      Authorization: `Bearer ${jwt}`, 'X-User': s.f.alpha, 'X-TenantId': configuration.tenantId,
      'X-Oid': s.f.seed.users[0].directoryObjectId, 'X-Capability': 'poc:read',
    } }));
    assertError(result, 404, 'NOT_FOUND');
  });
  test(`HTTP ${resource}: revocación entre peticiones es inmediata en la siguiente transacción`, async () => {
    const s = setup(); const jwt = await s.token(); const a = s.f.seed.assignments[0];
    assert.equal((await s.handlers[resource](s.request(jwt))).status, 200);
    await s.work.runAtomic(c => c.assignments.setEnabled(a.id, a.version, false));
    assertError(await s.handlers[resource](s.request(jwt)), 404, 'NOT_FOUND');
  });
  test(`HTTP ${resource}: error interno no revela datos del repositorio`, async () => {
    const s = setup(); const jwt = await s.token();
    const broken = { runAtomic: async () => { throw new Error(`synthetic-sensitive repository ${jwt}`); } };
    const handler = createFichaHandlers(s.h.validator, new ReadFichaQueries(broken, s.authorization))[resource];
    assertError(await handler(s.request(jwt)), 500, 'INTERNAL_ERROR', jwt);
  });
}

test('GET no modifica entidades, versiones, auditoría ni idempotencia', async () => {
  const s = setup();
  let eventId;
  await s.work.runAtomic(async c => {
    const report = await c.reports.create(reportInput(s.f));
    const event = auditEvent(s.f, report); eventId = event.id;
    await c.audit.append(event);
    const reserved = await c.idempotency.reserve(reservation(s.f));
    await c.idempotency.complete(reserved.id, reserved.version, { report, auditEventId: event.id }, s.f.now);
  });
  const snapshot = () => s.work.runAtomic(async c => ({
    users: await Promise.all(s.f.seed.users.map(u => c.users.findById(u.id))),
    fichas: await c.fichas.findByIds([s.f.fichaAlpha, s.f.fichaBeta]),
    assignments: await Promise.all(s.f.seed.assignments.map(a => c.assignments.findById(a.id))),
    activities: await Promise.all(s.f.seed.activities.map(a => c.activities.findById(a.id))),
    report: await c.reports.findById(reportInput(s.f).id),
    audit: await c.audit.findById(eventId),
    idempotency: await c.idempotency.findByScope(reservation(s.f).scope),
  }));
  const before = await snapshot(); const jwt = await s.token();
  for (const resource of ['ficha', 'actividades']) {
    await s.handlers[resource](s.request(jwt));
    await s.handlers[resource](s.request(jwt, s.f.fichaBeta));
  }
  assert.deepEqual(await snapshot(), before);
});

test('GET independientes no comparten revocaciones ni estado', async () => {
  const first = setup(); const second = setup(); const jwt = await first.token();
  const a = first.f.seed.assignments[0];
  await first.work.runAtomic(c => c.assignments.setEnabled(a.id, a.version, false));
  assert.equal((await first.handlers.ficha(first.request(jwt))).status, 404);
  assert.equal((await second.handlers.ficha(second.request(jwt))).status, 200);
});
test('la consulta autorizada mantiene su instantánea mientras una revocación espera', async () => {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers();
  let pause = true;
  const s = setup(() => {}, { isApplicable: () => {
    if (pause) { pause = false; entered.resolve(); }
    return true;
  } });
  const wrappingWork = { runAtomic: callback => s.work.runAtomic(async c => {
    const result = await callback(c);
    await release.promise;
    return result;
  }) };
  const handlers = createFichaHandlers(s.h.validator, new ReadFichaQueries(wrappingWork, s.authorization));
  const jwt = await s.token();
  const reading = handlers.ficha(s.request(jwt));
  await entered.promise;
  const a = s.f.seed.assignments[0];
  const revocation = s.work.runAtomic(c => c.assignments.setEnabled(a.id, a.version, false));
  release.resolve();
  assert.equal((await reading).status, 200);
  await revocation;
  assert.equal((await s.handlers.ficha(s.request(jwt))).status, 404);
});
test('adaptador incoherente con actividades de otra ficha falla cerrado', async () => {
  const s = setup(); const jwt = await s.token();
  const broken = { runAtomic: callback => s.work.runAtomic(c => callback({ ...c,
    activities: { ...c.activities, listByFicha: async () => s.f.seed.activities },
  })) };
  const handlers = createFichaHandlers(s.h.validator, new ReadFichaQueries(broken, s.authorization));
  assertError(await handlers.actividades(s.request(jwt)), 500, 'INTERNAL_ERROR', jwt);
});
test('composición local sin configuración o incompleta falla cerrada y no afecta health', () => {
  for (const raw of [undefined, '', '{bad', '{}', JSON.stringify({ ...configuration, allowedClientIds: [] })]) {
    const handlers = createLocalQueryHandlers(raw);
    assertError(handlers.ficha(), 500, 'INTERNAL_ERROR');
    assertError(handlers.actividades(), 500, 'INTERNAL_ERROR');
  }
  const response = health(new HttpRequest({ method: 'GET', url: 'http://127.0.0.1/api/poc/health' }), new InvocationContext());
  assert.deepEqual(response.jsonBody, { status: 'ok', service: 'pai-api-poc', stage: 'L1', mode: 'local-only' });
});
test('composición configurada no incorpora fixtures ni acepta JWT sintético mediante fallback', async () => {
  const handlers = createLocalQueryHandlers(JSON.stringify(configuration));
  const s = setup();
  assertError(await handlers.ficha(s.request()), 401, 'UNAUTHENTICATED');
  const jwt = await s.token(); // Sin DI, claves sintéticas no son confiables; fetch global bloqueado.
  assertError(await handlers.ficha(s.request(jwt)), 401, 'UNAUTHENTICATED', jwt);
});
