import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entityId, periodKey, idempotencyKey, correlationId, requestFingerprint, version, utcInstant, decimalText,
} from '../.local-build/domain/types.js';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { fixtures, reportInput, auditEvent, reservation } from './fixtures/memory.mjs';

const invalid = error => { assert.equal(error.code, 'INVALID_VALUE'); return true; };
function rejectsValues(make, values) { for (const value of values) assert.throws(() => make(value), invalid); }

for (const kind of ['user', 'dependency', 'ficha', 'assignment', 'activity', 'report', 'audit-event', 'idempotency-record']) {
  test(`L7-B2 ID ${kind}: ASCII 1–64 sin normalización`, () => {
    for (const value of ['A', 'a'.repeat(64), 'A.B_c-9', 'A', 'a']) assert.equal(entityId(kind, value), value);
    rejectsValues(v => entityId(kind, v), ['', 'a'.repeat(65), '_a', '-a', '.a', 'a:b', 'a b', 'á', 'a\n', ' a', 'a ', '\ud800', null, 42]);
  });
}
for (const kind of ['tenant', 'directory-object']) {
  test(`L7-B2 ${kind}: GUID canónico minúsculo no nulo`, () => {
    const guid = 'abcdefab-1234-4234-8234-123456789abc';
    assert.equal(entityId(kind, guid), guid);
    rejectsValues(v => entityId(kind, v), [guid.toUpperCase(), `{${guid}}`, guid.replaceAll('-', ''), guid + 'x',
      '00000000-0000-0000-0000-000000000000', 'synthetic-tenant', '', null]);
  });
}
test('L7-B2 periodo: límite UTF-16 y Unicode bien formado sin normalizar', () => {
  for (const value of ['A', 'a'.repeat(128), '😀'.repeat(64), 'a'.repeat(126) + '😀', 'e\u0301', 'é', 'periodo interno']) {
    assert.equal(periodKey(value), value);
  }
  assert.notEqual(periodKey('é'), periodKey('e\u0301'));
  rejectsValues(periodKey, ['', 'a'.repeat(129), 'a'.repeat(127) + '😀', '\ud800', '\udc00', 'a\ud800b', 'a\udc00b',
    '\ud800\ud800', ' a', 'a ', '\u00a0a', 'a\u00a0', 'a\n', 'a\u0000b', 'a\u007fb', null]);
});
for (const [label, make, max] of [['clave', idempotencyKey, 128], ['correlación', correlationId, 64]]) {
  test(`L7-B2 ${label}: alfabeto propio y límites`, () => {
    for (const value of ['A', 'a'.repeat(max), 'A.b_c-9:0']) assert.equal(make(value), value);
    rejectsValues(make, ['', 'a'.repeat(max + 1), ':a', 'a/b', 'a b', 'á', '😀', 'a\t', null]);
  });
}
test('L7-B2 versión: ASCII visible opaco sin exigir UUID ni contador', () => {
  for (const value of ['!', 'v'.repeat(128), 'sqlrv1:00000000000000af', 'obsolete', 'v/+=?:[]']) assert.equal(version(value), value);
  rejectsValues(version, ['', 'v'.repeat(129), 'a b', 'a\n', 'a\u007f', 'é', '😀', null, 1]);
});
test('L7-B2 huella: exactamente SHA-256 hexadecimal minúsculo', () => {
  assert.equal(requestFingerprint('0123456789abcdef'.repeat(4)), '0123456789abcdef'.repeat(4));
  rejectsValues(requestFingerprint, ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), 'synthetic-fingerprint', null]);
});
test('L7-B2 UTC: milisegundos y rango 0001–9999, sin fechas normalizadas', () => {
  for (const value of ['0001-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z', '2000-02-29T12:34:56.123Z']) assert.equal(utcInstant(value), value);
  rejectsValues(utcInstant, ['0000-01-01T00:00:00.000Z', '+010000-01-01T00:00:00.000Z', '-000001-01-01T00:00:00.000Z',
    '2001-02-29T00:00:00.000Z', '2000-01-01T00:00:00Z', '2000-01-01T00:00:00.000+00:00', '2000-01-01T00:00:00.000Z\n', null]);
});
test('L7-B2 decimal: representación y gramática anterior intactas, sin límite HTTP en dominio', () => {
  for (const value of ['0', '-0', '-0.000', '1.0', '1.000', '9'.repeat(200) + '.0001']) assert.equal(decimalText(value), value);
  rejectsValues(decimalText, ['01', '+1', '.1', '1.', '1e3', '1,0', ' 1', 1, null]);
});

test('L7-B2 semillas: rechaza representaciones inválidas en las seis entidades precargables', () => {
  const cases = [
    f => { f.seed.users[0].tenantId = 'synthetic-tenant'; },
    f => { f.seed.users[0].directoryObjectId = 'ABCDEFAB-1234-4234-8234-123456789ABC'; },
    f => { f.seed.dependencies[0].id = 'd'.repeat(65); },
    f => { f.seed.fichas[0].dependencyId = 'bad:id'; },
    f => { f.seed.activities[0].version = 'not visible'; },
    f => { f.seed.assignments[0].validUntil = '0000-01-01T00:00:00.000Z'; },
    f => { f.seed.reports = [reportInput(f, { period: '\ud800', version: version('seed') })]; },
    f => { f.seed.reports = [reportInput(f, { quantity: '01', version: version('seed') })]; },
  ];
  for (const change of cases) { const f = fixtures(); change(f); assert.throws(() => new MemoryUnitOfWork(f.seed), invalid); }
});

const writes = [
  ['create', (c, f) => c.reports.create(reportInput(f, { id: 'r'.repeat(65), period: 'another' }))],
  ['update', (c, f, b) => c.reports.update(b.report.id, b.report.version, { ...b.report, period: 'ignored', updatedAt: '0000-01-01T00:00:00.000Z' })],
  ['user', (c, f) => c.users.setEnabled(f.alpha, 'v'.repeat(129), false)],
  ['assignment', (c, f) => c.assignments.setEnabled(f.seed.assignments[0].id, 'bad version', false)],
  ['audit', (c, f, b) => c.audit.append(auditEvent(f, b.report, { id: 'second-event', correlationId: 'x'.repeat(65) }))],
  ['audit snapshot', (c, f, b) => c.audit.append(auditEvent(f, { ...b.report, period: '\ud800' }, { id: 'second-event' }))],
  ['reserve', (c, f) => c.idempotency.reserve({ ...reservation(f), requestFingerprint: 'A'.repeat(64) })],
  ['complete', (c, f, b) => c.idempotency.complete(b.pending.id, b.pending.version, { report: { ...b.report, quantity: '01' }, auditEventId: b.event.id }, f.now)],
];
for (const [action, table, badField, badValue] of [
  ['poc:user-enabled-changed', 'users', 'directoryObjectId', 'NOT-A-GUID'],
  ['poc:assignment-enabled-changed', 'assignments', 'validFrom', '+010000-01-01T00:00:00.000Z'],
]) {
  test(`L7-B2 auditoría ${action}: valida ambos snapshots y conserva append-only`, async () => {
    const f = fixtures(); const store = new MemoryUnitOfWork(f.seed);
    const before = f.seed[table][0];
    const event = { id: 'state-change', actorId: f.alpha, occurredAt: f.now, correlationId: 'correlation',
      change: { action, before, after: { ...before, enabled: false } } };
    for (const side of ['before', 'after']) {
      await assert.rejects(store.runAtomic(c => c.audit.append({ ...event,
        change: { ...event.change, [side]: { ...event.change[side], [badField]: badValue } } })), invalid);
      assert.equal(await store.runAtomic(c => c.audit.findById(event.id)), null);
    }
    await store.runAtomic(c => c.audit.append(event));
    event.change.after.enabled = true;
    assert.equal((await store.runAtomic(c => c.audit.findById(event.id))).change.after.enabled, false);
    await assert.rejects(store.runAtomic(c => c.audit.append(event)), { code: 'DUPLICATE' });
  });
}
for (const [name, write] of writes) {
  test(`L7-B2 ${name}: fallo capturado revierte reporte, auditoría, reserva y habilitación`, async () => {
    const f = fixtures(); const store = new MemoryUnitOfWork(f.seed);
    let escaped;
    await assert.rejects(store.runAtomic(async c => {
      escaped = c;
      const report = await c.reports.create(reportInput(f));
      const event = auditEvent(f, report); await c.audit.append(event);
      const pending = await c.idempotency.reserve(reservation(f));
      await c.users.setEnabled(f.alpha, f.seed.users[0].version, false);
      await assert.rejects(write(c, f, { report, event, pending }), invalid);
    }), invalid);
    await assert.rejects(escaped.reports.findById('synthetic-report'), { code: 'INCOMPATIBLE_STATE' });
    await store.runAtomic(async c => {
      assert.equal(await c.reports.findById('synthetic-report'), null);
      assert.equal(await c.audit.findById('synthetic-event'), null);
      assert.equal(await c.idempotency.findByScope(reservation(f).scope), null);
      assert.deepEqual(await c.users.findById(f.alpha), f.seed.users[0]);
    });
  });
}
