import type { TransactionContext } from '../../application/ports/unitOfWork.js';
import type { ActivityRepository, AssignmentRepository, AuditRepository, FichaRepository, IdempotencyRepository, ReportRepository, UserRepository } from '../../application/ports/repositories.js';
import type { CompletedIdempotency, Report, ReservedIdempotency } from '../../domain/entities.js';
import { DuplicateError, IncompatibleStateError } from '../../domain/errors.js';
import { copy, requireRow, tuple, validateAudit, validateReport } from './state.js';
import { entityId, idempotencyKey, requestFingerprint, utcInstant, version } from '../../domain/types.js';
import type { MemorySession } from './session.js';

export function createTransactionContext(session: MemorySession): TransactionContext {
  const state = session.state;
  const users: UserRepository = {
    findById: (id) => session.invoke(() => copy(state.users.get(id) ?? null)),
    findByIdentity: (tenantId, objectId) => session.invoke(() => copy(
      [...state.users.values()].find((user) => user.tenantId === tenantId && user.directoryObjectId === objectId) ?? null,
    )),
    setEnabled: (id, expected, enabled) => session.invoke(() => {
      entityId('user', id);
      const current = requireRow(state.users, id);
      session.checkVersion(current.version, expected);
      const result = { ...current, enabled, version: session.nextVersion() };
      state.users.set(id, result);
      return copy(result);
    }),
  };
  const assignments: AssignmentRepository = {
    findById: (id) => session.invoke(() => copy(state.assignments.get(id) ?? null)),
    listByUserAndFicha: (userId, fichaId) => session.invoke(() => copy(
      [...state.assignments.values()].filter((row) => row.userId === userId && row.fichaId === fichaId),
    )),
    setEnabled: (id, expected, enabled) => session.invoke(() => {
      entityId('assignment', id);
      const current = requireRow(state.assignments, id);
      session.checkVersion(current.version, expected);
      const result = { ...current, enabled, version: session.nextVersion() };
      state.assignments.set(id, result);
      return copy(result);
    }),
  };
  const fichas: FichaRepository = {
    findById: (id) => session.invoke(() => copy(state.fichas.get(id) ?? null)),
    findByIds: (ids) => session.invoke(() => copy(
      [...new Set(ids)].flatMap((id) => { const row = state.fichas.get(id); return row ? [row] : []; }),
    )),
  };
  const activities: ActivityRepository = {
    findById: (id) => session.invoke(() => copy(state.activities.get(id) ?? null)),
    listByFicha: (fichaId) => session.invoke(() => copy([...state.activities.values()].filter((row) => row.fichaId === fichaId))),
  };
  const reports: ReportRepository = {
    findById: (id) => session.invoke(() => copy(state.reports.get(id) ?? null)),
    findByActivityAndPeriod: (activityId, period) => session.invoke(() => copy(
      [...state.reports.values()].find((row) => row.activityId === activityId && row.period === period) ?? null,
    )),
    create: (input) => session.invoke(() => {
      validateReport(input);
      if (state.reports.has(input.id) || [...state.reports.values()].some(
        (row) => row.activityId === input.activityId && row.period === input.period,
      )) throw new DuplicateError();
      requireRow(state.activities, input.activityId);
      requireRow(state.users, input.createdBy);
      requireRow(state.users, input.updatedBy);
      const result: Report = {
        id: input.id, activityId: input.activityId, period: input.period,
        quantity: input.quantity, narrative: input.narrative, state: input.state,
        createdBy: input.createdBy, createdAt: input.createdAt,
        updatedBy: input.updatedBy, updatedAt: input.updatedAt, version: session.nextVersion(),
      };
      state.reports.set(result.id, result);
      return copy(result);
    }),
    update: (id, expected, changes) => session.invoke(() => {
      entityId('report', id);
      const current = requireRow(state.reports, id);
      session.checkVersion(current.version, expected);
      requireRow(state.users, changes.updatedBy);
      const result: Report = {
        ...current, quantity: changes.quantity, narrative: changes.narrative, state: changes.state,
        updatedBy: changes.updatedBy, updatedAt: changes.updatedAt, version: session.nextVersion(),
      };
      validateReport(result);
      state.reports.set(id, result);
      return copy(result);
    }),
  };
  const audit: AuditRepository = {
    append: (event) => session.invoke(() => {
      validateAudit(event);
      if (state.audit.has(event.id)) throw new DuplicateError();
      requireRow(state.users, event.actorId);
      state.audit.set(event.id, copy(event));
    }),
    findById: (id) => session.invoke(() => copy(state.audit.get(id) ?? null)),
  };
  const idempotency: IdempotencyRepository = {
    findByScope: (scope) => session.invoke(() => copy([...state.idempotency.values()].find(
      (row) => tuple(row.scope.actorId, row.scope.operation, row.scope.key) === tuple(scope.actorId, scope.operation, scope.key),
    ) ?? null)),
    reserve: (input) => session.invoke(() => {
      entityId('idempotency-record', input.id); entityId('user', input.scope.actorId);
      idempotencyKey(input.scope.key); requestFingerprint(input.requestFingerprint); utcInstant(input.createdAt);
      const key = tuple(input.scope.actorId, input.scope.operation, input.scope.key);
      if (state.idempotency.has(input.id) || [...state.idempotency.values()].some(
        (row) => tuple(row.scope.actorId, row.scope.operation, row.scope.key) === key,
      )) throw new DuplicateError();
      requireRow(state.users, input.scope.actorId);
      const result: ReservedIdempotency = {
        id: input.id, scope: copy(input.scope), requestFingerprint: input.requestFingerprint,
        createdAt: input.createdAt, version: session.nextVersion(),
        state: 'poc:reserved', outcome: null, completedAt: null,
      };
      state.idempotency.set(result.id, result);
      return copy(result);
    }),
    complete: (id, expected, outcome, completedAt) => session.invoke(() => {
      entityId('idempotency-record', id); entityId('audit-event', outcome.auditEventId);
      validateReport(outcome.report); version(outcome.report.version); utcInstant(completedAt);
      const current = requireRow(state.idempotency, id);
      session.checkVersion(current.version, expected);
      if (current.state !== 'poc:reserved') throw new IncompatibleStateError();
      requireRow(state.reports, outcome.report.id);
      requireRow(state.audit, outcome.auditEventId);
      const result: CompletedIdempotency = {
        ...current, state: 'poc:completed', outcome: copy(outcome), completedAt, version: session.nextVersion(),
      };
      state.idempotency.set(id, result);
      return copy(result);
    }),
  };
  return Object.freeze({
    users: Object.freeze(users), assignments: Object.freeze(assignments), fichas: Object.freeze(fichas),
    activities: Object.freeze(activities), reports: Object.freeze(reports),
    audit: Object.freeze(audit), idempotency: Object.freeze(idempotency),
  });
}
