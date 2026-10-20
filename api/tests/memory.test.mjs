import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { entityId, version, periodKey, requestFingerprint } from '../.local-build/domain/types.js';
import { fixtures, reportInput, auditEvent, reservation } from './fixtures/memory.mjs';

const code = (expected) => (error) => { assert.equal(error.code, expected); return true; };
const missing = (kind) => entityId(kind, kind === 'tenant' || kind === 'directory-object' ? '99999999-9999-4999-8999-999999999999' : 'synthetic-missing');
function setup() { const f = fixtures(); return { f, store: new MemoryUnitOfWork(f.seed) }; }
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function createBundle(tx, f) {
  const report = await tx.reports.create(reportInput(f));
  const event = auditEvent(f, report);
  await tx.audit.append(event);
  const pending = await tx.idempotency.reserve(reservation(f));
  const completed = await tx.idempotency.complete(pending.id, pending.version, { report, auditEventId: event.id }, f.now);
  return { report, event, completed };
}

test('catálogos sintéticos: dos dependencias, una ficha y dos actividades por dependencia', async () => {
  const { f, store } = setup();
  assert.deepEqual(f.seed.dependencies.map((row) => row.label), ['DEP-ALFA', 'DEP-BETA']);
  await store.runAtomic(async (tx) => {
    const rows = await tx.fichas.findByIds([f.fichaBeta, f.fichaAlpha, f.fichaAlpha, missing('ficha')]);
    assert.deepEqual(rows.map((row) => row.id), [f.fichaBeta, f.fichaAlpha]);
    assert.equal((await tx.fichas.findById(f.fichaAlpha)).dependencyId, f.seed.dependencies[0].id);
    for (const id of [f.fichaAlpha, f.fichaBeta]) assert.equal((await tx.activities.listByFicha(id)).length, 2);
    assert.equal((await tx.activities.findById(f.seed.activities[0].id)).fichaId, f.fichaAlpha);
    assert.equal(await tx.fichas.findById(missing('ficha')), null);
    assert.equal(await tx.activities.findById(missing('activity')), null);
    assert.deepEqual(await tx.activities.listByFicha(missing('ficha')), []);
  });
});

test('usuarios: identidad compuesta, inexistencia y habilitación versionada', async () => {
  const { f, store } = setup();
  const initial = await store.runAtomic(async (tx) => tx.users.findById(f.alpha));
  assert.equal(initial.id, f.alpha);
  const changed = await store.runAtomic(async (tx) => {
    assert.deepEqual(await tx.users.findByIdentity(initial.tenantId, initial.directoryObjectId), initial);
    assert.equal(await tx.users.findByIdentity(missing('tenant'), initial.directoryObjectId), null);
    assert.equal(await tx.users.findById(missing('user')), null);
    return tx.users.setEnabled(f.alpha, initial.version, false);
  });
  assert.equal(changed.enabled, false);
  assert.notEqual(changed.version, initial.version);
  await assert.rejects(store.runAtomic(async (tx) => tx.users.setEnabled(f.alpha, initial.version, true)), code('VERSION_CONFLICT'));
  await assert.rejects(store.runAtomic(async (tx) => tx.users.setEnabled(missing('user'), initial.version, true)), code('NOT_FOUND'));
  assert.deepEqual(await store.runAtomic(async (tx) => tx.users.findById(f.alpha)), changed);
});

test('asignaciones: listar y deshabilitar sin filtrar ni implementar autorización', async () => {
  const { f, store } = setup();
  const assignment = f.seed.assignments[0];
  const updated = await store.runAtomic(async (tx) => tx.assignments.setEnabled(assignment.id, assignment.version, false));
  assert.equal(updated.enabled, false);
  assert.notEqual(updated.version, assignment.version);
  await store.runAtomic(async (tx) => {
    const rows = await tx.assignments.listByUserAndFicha(f.alpha, f.fichaAlpha);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.id === assignment.id).enabled, false);
    assert.deepEqual(await tx.assignments.listByUserAndFicha(f.alpha, f.fichaBeta), []);
    assert.equal(await tx.assignments.findById(missing('assignment')), null);
  });
  await assert.rejects(store.runAtomic(async (tx) => tx.assignments.setEnabled(assignment.id, assignment.version, true)), code('VERSION_CONFLICT'));
  await assert.rejects(store.runAtomic(async (tx) => tx.assignments.setEnabled(missing('assignment'), assignment.version, true)), code('NOT_FOUND'));
});

test('reportes: crear, recuperar y actualizar sin cambiar identidad, actividad o creación', async () => {
  const { f, store } = setup();
  const input = reportInput(f);
  const created = await store.runAtomic(async (tx) => tx.reports.create(input));
  await store.runAtomic(async (tx) => {
    assert.deepEqual(await tx.reports.findByActivityAndPeriod(input.activityId, input.period), created);
    assert.equal(await tx.reports.findById(missing('report')), null);
    assert.equal(await tx.reports.findByActivityAndPeriod(input.activityId, periodKey('absent')), null);
  });
  const updated = await store.runAtomic(async (tx) => tx.reports.update(created.id, created.version, {
    quantity: null, narrative: 'Cambio sintético', state: 'poc-blocked', updatedBy: f.beta, updatedAt: f.now,
    id: missing('report'), activityId: missing('activity'), createdBy: missing('user'),
  }));
  assert.equal(updated.id, created.id);
  assert.equal(updated.activityId, created.activityId);
  assert.equal(updated.createdBy, created.createdBy);
  assert.equal(updated.period, created.period);
  assert.equal(updated.narrative, 'Cambio sintético');
  assert.equal(updated.quantity, null);
  assert.notEqual(updated.version, created.version);
  // El adaptador no inventa una política de bloqueo: L4 deberá evaluarla.
  await store.runAtomic(async (tx) => tx.reports.update(updated.id, updated.version, { ...updated, narrative: 'Sin política institucional' }));
});

test('reportes: unicidad por ID y por actividad/periodo, sin pérdida del original', async () => {
  const { f, store } = setup();
  const created = await store.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  for (const input of [reportInput(f, { period: periodKey('another') }), reportInput(f, { id: entityId('report', 'other') })]) {
    await assert.rejects(store.runAtomic(async (tx) => tx.reports.create(input)), code('DUPLICATE'));
  }
  assert.deepEqual(await store.runAtomic(async (tx) => tx.reports.findById(created.id)), created);
});

test('reportes: referencias inexistentes y versión obsoleta fallan sin modificaciones', async () => {
  const { f, store } = setup();
  await assert.rejects(store.runAtomic(async (tx) => tx.reports.create(reportInput(f, { activityId: missing('activity') }))), code('NOT_FOUND'));
  await assert.rejects(store.runAtomic(async (tx) => tx.reports.create(reportInput(f, { createdBy: missing('user') }))), code('NOT_FOUND'));
  const created = await store.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  await assert.rejects(store.runAtomic(async (tx) => tx.reports.update(created.id, version('obsolete'), created)), code('VERSION_CONFLICT'));
  await assert.rejects(store.runAtomic(async (tx) => tx.reports.update(missing('report'), created.version, created)), code('NOT_FOUND'));
  assert.deepEqual(await store.runAtomic(async (tx) => tx.reports.findById(created.id)), created);
});

test('auditoría: append-only, ID único y copias profundas de entrada y salida', async () => {
  const { f, store } = setup();
  const report = await store.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  const event = auditEvent(f, report);
  const original = structuredClone(event);
  await store.runAtomic(async (tx) => {
    assert.equal(await tx.audit.findById(missing('audit-event')), null);
    assert.equal('update' in tx.audit, false);
    assert.equal('delete' in tx.audit, false);
    await tx.audit.append(event);
    event.change.after.narrative = 'Mutación externa';
  });
  const read = await store.runAtomic(async (tx) => tx.audit.findById(event.id));
  assert.deepEqual(read, original);
  read.change.after.narrative = 'Mutación de resultado';
  await assert.rejects(store.runAtomic(async (tx) => tx.audit.append(original)), code('DUPLICATE'));
  assert.deepEqual(await store.runAtomic(async (tx) => tx.audit.findById(event.id)), original);
});

test('idempotencia: reservar, completar y conservar el resultado original tras otra edición', async () => {
  const { f, store } = setup();
  const result = await store.runAtomic(async (tx) => createBundle(tx, f));
  assert.equal(result.completed.state, 'poc:completed');
  assert.equal(result.completed.outcome.report.version, result.report.version);
  await store.runAtomic(async (tx) => tx.reports.update(result.report.id, result.report.version, { ...result.report, narrative: 'Nuevo estado persistido' }));
  const record = await store.runAtomic(async (tx) => tx.idempotency.findByScope(reservation(f).scope));
  assert.equal(record.outcome.report.narrative, result.report.narrative);
  assert.equal(record.outcome.report.version, result.report.version);
  record.outcome.report.narrative = 'Mutación del resultado';
  assert.deepEqual(await store.runAtomic(async (tx) => tx.idempotency.findByScope(reservation(f).scope)), result.completed);
});

test('idempotencia: duplicados por ID/scope se rechazan con igual o distinta huella', async () => {
  const { f, store } = setup();
  const initial = reservation(f);
  const pending = await store.runAtomic(async (tx) => tx.idempotency.reserve(initial));
  for (const input of [initial, { ...initial, id: entityId('idempotency-record', 'other') },
    { ...initial, id: entityId('idempotency-record', 'other'), requestFingerprint: requestFingerprint('b'.repeat(64)) },
    { ...initial, scope: { ...initial.scope, key: 'other-key' } }]) {
    await assert.rejects(store.runAtomic(async (tx) => tx.idempotency.reserve(input)), code('DUPLICATE'));
  }
  assert.deepEqual(await store.runAtomic(async (tx) => tx.idempotency.findByScope(initial.scope)), pending);
});

test('idempotencia: ámbito separa actor y operación, sin política de replay automática', async () => {
  const { f, store } = setup();
  const input = reservation(f);
  await store.runAtomic(async (tx) => {
    assert.equal(await tx.idempotency.findByScope(input.scope), null);
    await tx.idempotency.reserve(input);
    await tx.idempotency.reserve({ ...input, id: entityId('idempotency-record', 'by-actor'), scope: { ...input.scope, actorId: f.beta } });
    await tx.idempotency.reserve({ ...input, id: entityId('idempotency-record', 'by-operation'), scope: { ...input.scope, operation: 'poc:update-report' } });
  });
});

test('idempotencia: completar exige existencia, versión y estado reservado', async () => {
  const { f, store } = setup();
  const bundle = await store.runAtomic(async (tx) => createBundle(tx, f));
  const outcome = bundle.completed.outcome;
  await assert.rejects(store.runAtomic(async (tx) => tx.idempotency.complete(missing('idempotency-record'), bundle.completed.version, outcome, f.now)), code('NOT_FOUND'));
  await assert.rejects(store.runAtomic(async (tx) => tx.idempotency.complete(bundle.completed.id, version('obsolete'), outcome, f.now)), code('VERSION_CONFLICT'));
  await assert.rejects(store.runAtomic(async (tx) => tx.idempotency.complete(bundle.completed.id, bundle.completed.version, outcome, f.now)), code('INCOMPATIBLE_STATE'));
  assert.deepEqual(await store.runAtomic(async (tx) => tx.idempotency.findByScope(reservation(f).scope)), bundle.completed);
});

test('idempotencia: referencias ausentes al completar no cambian la reserva', async () => {
  const { f, store } = setup();
  const report = await store.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  const event = auditEvent(f, report);
  await store.runAtomic(async (tx) => tx.audit.append(event));
  const pending = await store.runAtomic(async (tx) => tx.idempotency.reserve(reservation(f)));
  for (const outcome of [{ report: { ...report, id: missing('report') }, auditEventId: event.id },
    { report, auditEventId: missing('audit-event') }]) {
    await assert.rejects(store.runAtomic(async (tx) => tx.idempotency.complete(pending.id, pending.version, outcome, f.now)), code('NOT_FOUND'));
    assert.deepEqual(await store.runAtomic(async (tx) => tx.idempotency.findByScope(pending.scope)), pending);
  }
});

test('idempotencia: complete guarda una copia profunda del resultado de entrada', async () => {
  const { f, store } = setup();
  const report = await store.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  const event = auditEvent(f, report);
  await store.runAtomic(async (tx) => tx.audit.append(event));
  const pending = await store.runAtomic(async (tx) => tx.idempotency.reserve(reservation(f)));
  const outcome = { report, auditEventId: event.id };
  await store.runAtomic(async (tx) => {
    await tx.idempotency.complete(pending.id, pending.version, outcome, f.now);
    outcome.report.narrative = 'Mutación posterior';
  });
  const saved = await store.runAtomic(async (tx) => tx.idempotency.findByScope(pending.scope));
  assert.equal(saved.outcome.report.narrative, 'Narración sintética');
  assert.notEqual(saved.version, pending.version);
});

test('rollback completo de usuario, asignación, reporte, auditoría e idempotencia', async () => {
  const { f, store } = setup();
  let discardedVersion;
  await assert.rejects(store.runAtomic(async (tx) => {
    await tx.users.setEnabled(f.alpha, f.seed.users[0].version, false);
    await tx.assignments.setEnabled(f.seed.assignments[0].id, f.seed.assignments[0].version, false);
    const result = await createBundle(tx, f);
    discardedVersion = result.report.version;
    throw new Error('synthetic-failure');
  }), /synthetic-failure/);
  await store.runAtomic(async (tx) => {
    assert.deepEqual(await tx.users.findById(f.alpha), f.seed.users[0]);
    assert.deepEqual(await tx.assignments.findById(f.seed.assignments[0].id), f.seed.assignments[0]);
    assert.equal(await tx.reports.findById(reportInput(f).id), null);
    assert.equal(await tx.audit.findById(auditEvent(f, {}).id), null);
    assert.equal(await tx.idempotency.findByScope(reservation(f).scope), null);
  });
  const restored = await store.runAtomic(async (tx) => createBundle(tx, f));
  assert.notEqual(restored.report.version, discardedVersion);
});

test('rollback de actualizaciones restaura contenido y versión ya confirmados', async () => {
  const { f, store } = setup();
  const current = await store.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  await assert.rejects(store.runAtomic(async (tx) => {
    const updated = await tx.reports.update(current.id, current.version, { ...current, narrative: 'No persistir' });
    await tx.audit.append(auditEvent(f, updated));
    await tx.idempotency.reserve(reservation(f));
    throw new Error('rollback-update');
  }), /rollback-update/);
  assert.deepEqual(await store.runAtomic(async (tx) => tx.reports.findById(current.id)), current);
  const recovered = await store.runAtomic(async (tx) => tx.reports.update(current.id, current.version, { ...current, narrative: 'Confirmado' }));
  assert.equal(recovered.narrative, 'Confirmado');
});

test('dos escrituras concurrentes con la misma versión: solo una confirma', async () => {
  const { f, store } = setup();
  const original = await store.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  const entered = deferred(); const release = deferred();
  const first = store.runAtomic(async (tx) => {
    const result = await tx.reports.update(original.id, original.version, { ...original, narrative: 'Primera' });
    entered.resolve(); await release.promise; return result;
  });
  await entered.promise;
  let secondEntered = false;
  const second = store.runAtomic(async (tx) => { secondEntered = true; return tx.reports.update(original.id, original.version, { ...original, narrative: 'Segunda' }); });
  assert.equal(secondEntered, false);
  release.resolve();
  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, 'VERSION_CONFLICT');
  assert.equal((await store.runAtomic(async (tx) => tx.reports.findById(original.id))).narrative, 'Primera');
});

test('carrera de creación: la segunda transacción observa la primera y no duplica', async () => {
  const { f, store } = setup();
  const results = await Promise.allSettled([1, 2].map(() => store.runAtomic(async (tx) => tx.reports.create(reportInput(f)))));
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal(results.find((row) => row.status === 'rejected').reason.code, 'DUPLICATE');
});

test('carrera de reserva idempotente: un único scope confirma', async () => {
  const { f, store } = setup();
  const results = await Promise.allSettled([1, 2].map((index) => store.runAtomic(async (tx) => tx.idempotency.reserve(reservation(f, { id: entityId('idempotency-record', `operation-${index}`) })))));
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal(results.find((row) => row.status === 'rejected').reason.code, 'DUPLICATE');
});

test('lecturas serializables: una revocación en cola no altera la instantánea activa', async () => {
  const { f, store } = setup();
  const entered = deferred(); const release = deferred();
  const first = store.runAtomic(async (tx) => {
    const before = await tx.users.findById(f.alpha);
    entered.resolve(); await release.promise;
    assert.deepEqual(await tx.users.findById(f.alpha), before);
  });
  await entered.promise;
  const revoke = store.runAtomic(async (tx) => tx.users.setEnabled(f.alpha, f.seed.users[0].version, false));
  release.resolve(); await Promise.all([first, revoke]);
  assert.equal((await store.runAtomic(async (tx) => tx.users.findById(f.alpha))).enabled, false);
});

test('copias defensivas de seed, inputs, listas y resultados entre transacciones', async () => {
  const f = fixtures(); const originalUser = structuredClone(f.seed.users[0]);
  const store = new MemoryUnitOfWork(f.seed);
  f.seed.users[0].alias = 'Cambio externo';
  f.seed.activities.length = 0;
  await store.runAtomic(async (tx) => {
    const user = await tx.users.findById(f.alpha);
    assert.deepEqual(user, originalUser);
    user.alias = 'Cambio de lectura';
    const rows = await tx.assignments.listByUserAndFicha(f.alpha, f.fichaAlpha);
    rows[0].enabled = false; rows.length = 0;
  });
  await store.runAtomic(async (tx) => {
    assert.deepEqual(await tx.users.findById(f.alpha), originalUser);
    assert.equal((await tx.activities.listByFicha(f.fichaAlpha)).length, 2);
    assert.equal((await tx.assignments.listByUserAndFicha(f.alpha, f.fichaAlpha))[0].enabled, true);
  });
});

test('copias de create y reserve se capturan antes de cambios posteriores del llamante', async () => {
  const { f, store } = setup(); const input = reportInput(f); const key = reservation(f);
  await store.runAtomic(async (tx) => {
    const operation = tx.reports.create(input);
    input.narrative = 'No persistir';
    const saved = await operation;
    saved.narrative = 'Tampoco persistir';
    await tx.idempotency.reserve(key);
    key.scope.actorId = f.beta;
  });
  assert.equal((await store.runAtomic(async (tx) => tx.reports.findById(input.id))).narrative, 'Narración sintética');
  assert.equal((await store.runAtomic(async (tx) => tx.idempotency.findByScope(reservation(f).scope))).scope.actorId, f.alpha);
});

test('un error de repositorio omitido o capturado igualmente aborta la transacción', async () => {
  const { f, store } = setup();
  await assert.rejects(store.runAtomic(async (tx) => {
    await tx.reports.create(reportInput(f));
    void tx.reports.create(reportInput(f));
  }), code('DUPLICATE'));
  assert.equal(await store.runAtomic(async (tx) => tx.reports.findById(reportInput(f).id)), null);
  await assert.rejects(store.runAtomic(async (tx) => {
    await tx.reports.create(reportInput(f));
    await assert.rejects(tx.reports.create(reportInput(f)), code('DUPLICATE'));
  }), code('DUPLICATE'));
});

test('operaciones no esperadas por el callback se completan antes del commit', async () => {
  const { f, store } = setup();
  await store.runAtomic(async (tx) => { void tx.reports.create(reportInput(f)); });
  assert.ok(await store.runAtomic(async (tx) => tx.reports.findById(reportInput(f).id)));
});

test('contextos finalizados o fallidos no permiten nuevas lecturas/escrituras', async () => {
  const { f, store } = setup(); let retained; let failed;
  await store.runAtomic(async (tx) => { retained = tx; });
  await assert.rejects(retained.reports.create(reportInput(f)), code('INCOMPATIBLE_STATE'));
  await assert.rejects(retained.users.findById(f.alpha), code('INCOMPATIBLE_STATE'));
  await assert.rejects(store.runAtomic(async (tx) => { failed = tx; throw new Error('end'); }), /end/);
  await assert.rejects(failed.reports.create(reportInput(f)), code('INCOMPATIBLE_STATE'));
  assert.equal(await store.runAtomic(async (tx) => tx.reports.findById(reportInput(f).id)), null);
});

test('una transacción anidada se rechaza sin bloquear la cola; después se recupera', async () => {
  const { f, store } = setup();
  await assert.rejects(store.runAtomic(async () => store.runAtomic(async (tx) => tx.users.findById(f.alpha))), code('INCOMPATIBLE_STATE'));
  assert.ok(await store.runAtomic(async (tx) => tx.users.findById(f.alpha)));
});

test('una excepción con otra operación en cola no deja un bloqueo permanente', async () => {
  const { f, store } = setup(); const entered = deferred(); const release = deferred();
  const bad = store.runAtomic(async (tx) => { await tx.reports.create(reportInput(f)); entered.resolve(); await release.promise; throw new Error('fail'); });
  await entered.promise;
  const next = store.runAtomic(async (tx) => { assert.equal(await tx.reports.findById(reportInput(f).id), null); return tx.reports.create(reportInput(f)); });
  release.resolve();
  const results = await Promise.allSettled([bad, next]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[1].status, 'fulfilled');
});

test('instancias independientes no comparten datos, cola ni versiones nuevas', async () => {
  const f = fixtures(); const first = new MemoryUnitOfWork(f.seed); const second = new MemoryUnitOfWork(f.seed);
  const row = await first.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  assert.equal(await second.runAtomic(async (tx) => tx.reports.findById(row.id)), null);
  const other = await second.runAtomic(async (tx) => tx.reports.create(reportInput(f)));
  assert.notEqual(row.version, other.version);
  const entered = deferred(); const release = deferred();
  const held = first.runAtomic(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  try { assert.ok(await second.runAtomic(async (tx) => tx.reports.findById(row.id))); }
  finally { release.resolve(); await held; }
});

test('inicialización: rechaza IDs/identidades repetidos y referencias huérfanas', () => {
  const f = fixtures();
  assert.throws(() => new MemoryUnitOfWork({ ...f.seed, users: [f.seed.users[0], f.seed.users[0]] }), code('DUPLICATE'));
  assert.throws(() => new MemoryUnitOfWork({ ...f.seed, users: [f.seed.users[0], { ...f.seed.users[0], id: f.beta }] }), code('DUPLICATE'));
  assert.throws(() => new MemoryUnitOfWork({ ...f.seed, dependencies: [] }), code('NOT_FOUND'));
  assert.throws(() => new MemoryUnitOfWork({ ...f.seed, assignments: [{ ...f.seed.assignments[0], userId: missing('user') }] }), code('NOT_FOUND'));
});
