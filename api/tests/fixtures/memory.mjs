import { entityId, version, utcInstant, periodKey, decimalText, correlationId, idempotencyKey, requestFingerprint } from '../../.local-build/domain/types.js';

/** Solo datos de laboratorio; crear siempre una copia nueva por prueba. */
export function fixtures() {
  const v = version('synthetic-initial-version');
  const now = utcInstant('2000-01-01T00:00:00.000Z');
  const alpha = entityId('user', 'synthetic-user-alpha');
  const beta = entityId('user', 'synthetic-user-beta');
  const reader = entityId('user', 'synthetic-user-reader');
  const depAlpha = entityId('dependency', 'DEP-ALFA');
  const depBeta = entityId('dependency', 'DEP-BETA');
  const fichaAlpha = entityId('ficha', 'synthetic-ficha-alpha');
  const fichaBeta = entityId('ficha', 'synthetic-ficha-beta');
  const activities = ['alpha-1', 'alpha-2', 'beta-1', 'beta-2'].map((name, index) => ({
    id: entityId('activity', `synthetic-activity-${name}`), fichaId: index < 2 ? fichaAlpha : fichaBeta,
    description: `Actividad sintética ${name}`, version: v,
  }));
  const users = [alpha, beta, reader].map((id, index) => ({
    id, tenantId: entityId('tenant', 'synthetic-tenant'),
    directoryObjectId: entityId('directory-object', `synthetic-object-${index}`),
    alias: `Actor sintético ${index}`, enabled: true, version: v,
  }));
  const assignments = [
    [alpha, fichaAlpha, 'poc:read'], [alpha, fichaAlpha, 'poc:edit-report'],
    [beta, fichaBeta, 'poc:read'], [beta, fichaBeta, 'poc:edit-report'],
    [reader, fichaAlpha, 'poc:read'],
  ].map(([userId, fichaId, capability], index) => ({
    id: entityId('assignment', `synthetic-assignment-${index}`), userId, fichaId,
    capability, enabled: true, validFrom: now, validUntil: null, version: v,
  }));
  return {
    now, alpha, beta, reader, fichaAlpha, fichaBeta,
    seed: {
      users, dependencies: [{ id: depAlpha, label: 'DEP-ALFA', version: v }, { id: depBeta, label: 'DEP-BETA', version: v }],
      fichas: [{ id: fichaAlpha, dependencyId: depAlpha, cycleLabel: 'synthetic-cycle', version: v },
        { id: fichaBeta, dependencyId: depBeta, cycleLabel: 'synthetic-cycle', version: v }],
      activities, assignments,
    },
  };
}

export function reportInput(f, overrides = {}) {
  return {
    id: entityId('report', 'synthetic-report'), activityId: f.seed.activities[0].id,
    period: periodKey('synthetic-period'), quantity: decimalText('1.000'), narrative: 'Narración sintética',
    state: 'poc-draft', createdBy: f.alpha, createdAt: f.now, updatedBy: f.alpha, updatedAt: f.now,
    ...overrides,
  };
}

export function auditEvent(f, report, overrides = {}) {
  return {
    id: entityId('audit-event', 'synthetic-event'), actorId: f.alpha, occurredAt: f.now,
    correlationId: correlationId('synthetic-correlation'),
    change: { action: 'poc:report-created', before: null, after: report }, ...overrides,
  };
}

export function reservation(f, overrides = {}) {
  return {
    id: entityId('idempotency-record', 'synthetic-operation'),
    scope: { actorId: f.alpha, operation: 'poc:create-report', key: idempotencyKey('synthetic-key') },
    requestFingerprint: requestFingerprint('synthetic-fingerprint'), createdAt: f.now, ...overrides,
  };
}
