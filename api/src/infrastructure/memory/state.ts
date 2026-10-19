import type { AccessAssignment, Activity, AuditEvent, Dependency, Ficha, IdempotencyRecord, InstitutionalUser, Report } from '../../domain/entities.js';
import { DuplicateError, NotFoundError } from '../../domain/errors.js';

/** Solo inicialización explícita; sin fixtures, archivos ni carga implícita. */
export interface MemorySeed {
  readonly users?: readonly InstitutionalUser[];
  readonly dependencies?: readonly Dependency[];
  readonly fichas?: readonly Ficha[];
  readonly assignments?: readonly AccessAssignment[];
  readonly activities?: readonly Activity[];
  readonly reports?: readonly Report[];
}

export interface MemoryState {
  users: Map<string, InstitutionalUser>;
  dependencies: Map<string, Dependency>;
  fichas: Map<string, Ficha>;
  assignments: Map<string, AccessAssignment>;
  activities: Map<string, Activity>;
  reports: Map<string, Report>;
  audit: Map<string, AuditEvent>;
  idempotency: Map<string, IdempotencyRecord>;
}

export function copy<Value>(value: Value): Value { return structuredClone(value); }
export function tuple(...parts: readonly string[]): string { return JSON.stringify(parts); }

function table<Row extends { readonly id: string }>(rows: readonly Row[] = []): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const row of rows) {
    if (result.has(row.id)) throw new DuplicateError();
    result.set(row.id, copy(row));
  }
  return result;
}

export function requireRow<Row>(rows: Map<string, Row>, id: string): Row {
  const row = rows.get(id);
  if (row === undefined) throw new NotFoundError();
  return row;
}

export function createState(seed: MemorySeed): MemoryState {
  const state: MemoryState = {
    users: table(seed.users), dependencies: table(seed.dependencies), fichas: table(seed.fichas),
    assignments: table(seed.assignments), activities: table(seed.activities), reports: table(seed.reports),
    audit: new Map(), idempotency: new Map(),
  };
  const identities = new Set<string>();
  for (const user of state.users.values()) {
    const identity = tuple(user.tenantId, user.directoryObjectId);
    if (identities.has(identity)) throw new DuplicateError();
    identities.add(identity);
  }
  for (const ficha of state.fichas.values()) requireRow(state.dependencies, ficha.dependencyId);
  for (const activity of state.activities.values()) requireRow(state.fichas, activity.fichaId);
  for (const assignment of state.assignments.values()) {
    requireRow(state.users, assignment.userId);
    requireRow(state.fichas, assignment.fichaId);
  }
  const reportKeys = new Set<string>();
  for (const report of state.reports.values()) {
    requireRow(state.activities, report.activityId);
    requireRow(state.users, report.createdBy);
    requireRow(state.users, report.updatedBy);
    const key = tuple(report.activityId, report.period);
    if (reportKeys.has(key)) throw new DuplicateError();
    reportKeys.add(key);
  }
  return state;
}
