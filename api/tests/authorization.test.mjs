import test from 'node:test';
import assert from 'node:assert/strict';
import { FichaAuthorizationService } from '../.local-build/application/authorization/service.js';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { entityId, utcInstant } from '../.local-build/domain/types.js';
import { fixtures, reportInput, auditEvent, reservation } from './fixtures/memory.mjs';
import { harness, signedToken } from './fixtures/identity.mjs';

// Solo pruebas de política; no es un proveedor de identidad ni se compila en src.
const tenant = entityId('tenant', '11111111-1111-4111-8111-111111111111');
const otherTenant = entityId('tenant', '99999999-9999-4999-8999-999999999999');
// Convención EXCLUSIVA de prueba, no definida en L2: [validFrom, validUntil).
const testValidity = Object.freeze({ isApplicable: (a, at) =>
  Date.parse(a.validFrom) <= Date.parse(at)
  && (a.validUntil === null || Date.parse(at) < Date.parse(a.validUntil)) });

function setup(change = () => {}, validity = testValidity) {
  const f = fixtures();
  f.seed.users = f.seed.users.map((u, i) => ({ ...u, tenantId: tenant,
    directoryObjectId: entityId('directory-object', `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`) }));
  change(f);
  const uow = new MemoryUnitOfWork(f.seed);
  const service = new FichaAuthorizationService(tenant, { now: () => f.now }, validity);
  function identity(index = 0, extra = {}) {
    const u = f.seed.users[index];
    return Object.freeze({ tenantId: u.tenantId, objectId: u.directoryObjectId,
      subjectKey: `${u.tenantId}:${u.directoryObjectId}`, clientId: '44444444-4444-4444-8444-444444444444',
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
      audience: '22222222-2222-4222-8222-222222222222', scopes: Object.freeze(['poc.access']),
      expiresAt: utcInstant('2000-01-01T01:00:00.000Z'), ...extra });
  }
  const decide = (who = identity(), ficha = f.fichaAlpha, cap = 'poc:read') =>
    uow.runAtomic(c => service.decide(c, who, ficha, cap));
  return { f, uow, service, identity, decide };
}

for (const [label, user, target, cap, allowed] of [
  ['ALFA consulta ALFA', 0, 'fichaAlpha', 'poc:read', true],
  ['ALFA edita ALFA', 0, 'fichaAlpha', 'poc:edit-report', true],
  ['ALFA no consulta BETA', 0, 'fichaBeta', 'poc:read', false],
  ['ALFA no edita BETA', 0, 'fichaBeta', 'poc:edit-report', false],
  ['BETA no consulta ALFA', 1, 'fichaAlpha', 'poc:read', false],
  ['BETA consulta BETA', 1, 'fichaBeta', 'poc:read', true],
  ['consultor consulta ALFA', 2, 'fichaAlpha', 'poc:read', true],
  ['consultor no edita ALFA', 2, 'fichaAlpha', 'poc:edit-report', false],
]) test(label, async () => {
  const s = setup();
  const decision = await s.decide(s.identity(user), s.f[target], cap);
  assert.equal(decision.allowed, allowed);
  assert.ok(Object.isFrozen(decision));
  if (allowed) assert.deepEqual(decision, { allowed: true, userId: s.f.seed.users[user].id,
    fichaId: s.f[target], capability: cap });
  else assert.deepEqual(decision, { allowed: false });
});

test('usuario reconocido sin asignaciones se deniega', async () => {
  const s = setup(f => { f.seed.assignments = []; });
  assert.deepEqual(await s.decide(), { allowed: false });
});
test('oid desconocido no se resuelve por nombre, correo, UPN o userId', async () => {
  const s = setup();
  assert.deepEqual(await s.decide(s.identity(0, { objectId: entityId('directory-object', 'unknown-object'),
    userId: s.f.alpha, email: s.f.seed.users[0].alias, upn: s.f.seed.users[0].alias })), { allowed: false });
});
test('ficha inexistente no se distingue en la decisión', async () => {
  const s = setup();
  assert.deepEqual(await s.decide(s.identity(), entityId('ficha', 'missing-ficha')), { allowed: false });
});
test('capacidad desconocida recibida desde JS se deniega', async () => {
  const s = setup();
  for (const cap of ['poc:admin', '*', '', null, undefined]) {
    // undefined explícito no pasa por el valor predeterminado del helper.
    assert.deepEqual(await s.uow.runAtomic(c => s.service.decide(c, s.identity(), s.f.fichaAlpha, cap)), { allowed: false });
  }
});
test('otro tenant se deniega aunque tenga usuario y asignación propios', async () => {
  const s = setup(f => { f.seed.users[0].tenantId = otherTenant; });
  assert.deepEqual(await s.decide(s.identity()), { allowed: false });
});
test('otro oid solo obtiene sus propias asignaciones, sin suplantar userId', async () => {
  const s = setup();
  assert.deepEqual(await s.decide(s.identity(1, { userId: s.f.alpha, subjectKey: s.identity().subjectKey })), { allowed: false });
});
test('roles, scopes y administración M365 no conceden edición', async () => {
  const s = setup();
  assert.deepEqual(await s.decide(s.identity(2, { roles: ['Global Administrator'],
    scopes: ['poc:edit-report', '*'], userId: s.f.alpha }), s.f.fichaAlpha, 'poc:edit-report'), { allowed: false });
});
test('edición no implica lectura y no hay herencia por dependencia', async () => {
  const s = setup(f => {
    f.seed.assignments = f.seed.assignments.filter(a => a.capability === 'poc:edit-report');
    f.seed.fichas[1].dependencyId = f.seed.fichas[0].dependencyId;
  });
  assert.equal((await s.decide(s.identity(), s.f.fichaAlpha, 'poc:edit-report')).allowed, true);
  assert.deepEqual(await s.decide(), { allowed: false });
  assert.deepEqual(await s.decide(s.identity(), s.f.fichaBeta, 'poc:edit-report'), { allowed: false });
});
test('usuario deshabilitado no obtiene acceso', async () => {
  const s = setup(f => { f.seed.users[0].enabled = false; });
  assert.deepEqual(await s.decide(), { allowed: false });
});
test('asignación deshabilitada no concede aun si la política temporal dice sí', async () => {
  const s = setup(f => { f.seed.assignments.forEach(a => { a.enabled = false; }); }, { isApplicable: () => true });
  assert.deepEqual(await s.decide(), { allowed: false });
});
for (const [label, dates, expected] of [
  ['inicio futuro', { validFrom: '2000-01-02T00:00:00.000Z' }, false],
  ['inicio exacto', { validFrom: '2000-01-01T00:00:00.000Z' }, true],
  ['fin exacto', { validUntil: '2000-01-01T00:00:00.000Z' }, false],
  ['fin pasado', { validUntil: '1999-12-31T00:00:00.000Z' }, false],
  ['intervalo vigente', { validUntil: '2000-01-02T00:00:00.000Z' }, true],
]) test(`política sintética explícita: ${label}`, async () => {
  const s = setup(f => { for (const a of f.seed.assignments) Object.assign(a, dates); });
  assert.equal((await s.decide()).allowed, expected);
});
test('la política temporal no tiene fallback permisivo', async () => {
  const s = setup(() => {}, { isApplicable: () => undefined });
  assert.deepEqual(await s.decide(), { allowed: false });
  const broken = setup(() => {}, { isApplicable: () => { throw new Error('synthetic policy failure'); } });
  await assert.rejects(broken.decide(), /synthetic policy failure/);
});
test('denegaciones no revelan ficha, usuario ni razón de existencia', async () => {
  const s = setup();
  await assert.rejects(s.uow.runAtomic(c => s.service.requireAllowed(c, s.identity(), s.f.fichaBeta, 'poc:read')),
    e => e.code === 'ACCESS_DENIED' && e.message === 'Operación no permitida.');
  assert.deepEqual(await s.decide(s.identity(), s.f.fichaBeta),
    await s.decide(s.identity(), entityId('ficha', 'missing-ficha')));
});
test('revocación y rehabilitación entre transacciones: sin caché', async () => {
  const s = setup();
  assert.equal((await s.decide()).allowed, true);
  const assignment = s.f.seed.assignments[0];
  const revoked = await s.uow.runAtomic(c => c.assignments.setEnabled(assignment.id, assignment.version, false));
  assert.deepEqual(await s.decide(), { allowed: false });
  await s.uow.runAtomic(c => c.assignments.setEnabled(revoked.id, revoked.version, true));
  assert.equal((await s.decide()).allowed, true);
});
test('revocar usuario entre transacciones invalida asignaciones habilitadas', async () => {
  const s = setup();
  assert.equal((await s.decide()).allowed, true);
  const u = s.f.seed.users[0];
  await s.uow.runAtomic(c => c.users.setEnabled(u.id, u.version, false));
  assert.deepEqual(await s.decide(), { allowed: false });
});

// Consumidor sintético SOLO en tests: carga la actividad real y deriva su ficha.
async function writeSynthetic(s, activityId = s.f.seed.activities[0].id, fail = false) {
  return s.uow.runAtomic(async c => {
    const activity = await c.activities.findById(activityId);
    assert.ok(activity);
    const decision = await s.service.requireAllowed(c, s.identity(), activity.fichaId, 'poc:edit-report');
    const reserved = await c.idempotency.reserve(reservation(s.f));
    const report = await c.reports.create(reportInput(s.f, { activityId,
      createdBy: decision.userId, updatedBy: decision.userId }));
    const event = auditEvent(s.f, report, { actorId: decision.userId });
    await c.audit.append(event);
    await c.idempotency.complete(reserved.id, reserved.version, { report, auditEventId: event.id }, s.f.now);
    if (fail) throw new Error('synthetic rollback');
    return report;
  });
}
test('autorización, reporte, auditoría e idempotencia comparten transacción', async () => {
  const s = setup();
  const report = await writeSynthetic(s);
  await s.uow.runAtomic(async c => {
    assert.deepEqual(await c.reports.findById(report.id), report);
    assert.equal((await c.audit.findById(auditEvent(s.f, report).id)).actorId, s.f.alpha);
    assert.equal((await c.idempotency.findByScope(reservation(s.f).scope)).state, 'poc:completed');
  });
});
test('fallo revierte escritura, auditoría e idempotencia autorizadas', async () => {
  const s = setup();
  await assert.rejects(writeSynthetic(s, undefined, true), /synthetic rollback/);
  await s.uow.runAtomic(async c => {
    assert.equal(await c.reports.findById(reportInput(s.f).id), null);
    assert.equal(await c.audit.findById(entityId('audit-event', 'synthetic-event')), null);
    assert.equal(await c.idempotency.findByScope(reservation(s.f).scope), null);
  });
});
test('manipular ID de actividad BETA no escribe bajo permiso ALFA', async () => {
  const s = setup();
  await assert.rejects(writeSynthetic(s, s.f.seed.activities[2].id), { code: 'ACCESS_DENIED' });
  assert.equal(await s.uow.runAtomic(c => c.reports.findById(reportInput(s.f).id)), null);
});
test('decisión previa no permite escribir después de revocación', async () => {
  const s = setup();
  assert.equal((await s.decide(s.identity(), s.f.fichaAlpha, 'poc:edit-report')).allowed, true);
  const a = s.f.seed.assignments[1];
  await s.uow.runAtomic(c => c.assignments.setEnabled(a.id, a.version, false));
  await assert.rejects(writeSynthetic(s), { code: 'ACCESS_DENIED' });
});
test('revocación concurrente anterior al escritor es visible sin ventana TOCTOU', async () => {
  const s = setup();
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const a = s.f.seed.assignments[1];
  const revocation = s.uow.runAtomic(async c => {
    await c.assignments.setEnabled(a.id, a.version, false);
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const writer = writeSynthetic(s);
  const rejected = assert.rejects(writer, { code: 'ACCESS_DENIED' });
  release.resolve();
  await revocation;
  await rejected;
  assert.equal(await s.uow.runAtomic(c => c.reports.findById(reportInput(s.f).id)), null);
});
test('revocación no contamina otra instancia del adaptador', async () => {
  const s = setup();
  const independent = new MemoryUnitOfWork(s.f.seed);
  const a = s.f.seed.assignments[0];
  await s.uow.runAtomic(c => c.assignments.setEnabled(a.id, a.version, false));
  assert.deepEqual(await s.decide(), { allowed: false });
  assert.equal((await independent.runAtomic(c => s.service.decide(c, s.identity(), s.f.fichaAlpha, 'poc:read'))).allowed, true);
});
test('un contexto ya cerrado no sirve para revalidar permisos', async () => {
  const s = setup();
  let retained;
  await s.uow.runAtomic(async c => { retained = c; });
  await assert.rejects(s.service.decide(retained, s.identity(), s.f.fichaAlpha, 'poc:read'), { code: 'INCOMPATIBLE_STATE' });
});

test('identidad validada criptográficamente por L4-A autoriza sin conectar HTTP', async () => {
  const s = setup();
  const h = harness(); // JWKS y metadata locales; clave privada efímera, sin red.
  const token = await signedToken({ oid: s.f.seed.users[0].directoryObjectId });
  const identity = await h.validator.validateAuthorization(`Bearer ${token}`);
  assert.equal((await s.decide(identity)).allowed, true);
  assert.deepEqual(await s.decide(identity, s.f.fichaBeta), { allowed: false });
});
