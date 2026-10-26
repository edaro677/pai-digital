import type { AccessAssignment, Activity, AuditEvent, Dependency, Ficha, IdempotencyRecord, InstitutionalUser, Report } from '../../domain/entities.js';
import { DuplicateError, InvalidValueError, NotFoundError } from '../../domain/errors.js';
import { correlationId, decimalText, entityId, periodKey, utcInstant, version } from '../../domain/types.js';
import type { NewReport } from '../../application/ports/repositories.js';
import type { DeclaredEvidence, SubmittedReport } from '../../domain/evidence.js';
import { validateDeclaredEvidence, validateVerifiedFile } from '../../domain/evidence.js';

// Frontera de persistencia: también valida entradas JS sin confiar en marcas TypeScript.
export function validateUser(row: InstitutionalUser): void {
  entityId('user', row.id); entityId('tenant', row.tenantId);
  entityId('directory-object', row.directoryObjectId); version(row.version);
}
export function validateAssignment(row: AccessAssignment): void {
  entityId('assignment', row.id); entityId('user', row.userId); entityId('ficha', row.fichaId);
  utcInstant(row.validFrom); if (row.validUntil !== null) utcInstant(row.validUntil);
  version(row.version);
}
export function validateReport(row: NewReport): void {
  entityId('report', row.id); entityId('activity', row.activityId); periodKey(row.period);
  if (row.quantity !== null) decimalText(row.quantity);
  entityId('user', row.createdBy); entityId('user', row.updatedBy);
  utcInstant(row.createdAt); utcInstant(row.updatedAt);
}
export function validateAudit(event: AuditEvent): void {
  entityId('audit-event', event.id); entityId('user', event.actorId);
  utcInstant(event.occurredAt); correlationId(event.correlationId);
  const change = event.change;
  if (change.action === 'poc:user-enabled-changed') {
    validateUser(change.before); validateUser(change.after);
  } else if (change.action === 'poc:assignment-enabled-changed') {
    validateAssignment(change.before); validateAssignment(change.after);
  } else {
    if((change.action==='poc:evidence-declared' || change.action==='poc:report-submitted')
      && (change.before===null || !('progress' in change)))throw new InvalidValueError();
    if (change.before !== null) { validateReport(change.before); version(change.before.version); }
    validateReport(change.after); version(change.after.version);
    if ('progress' in change) {
      if (change.action === 'poc:evidence-declared' && change.progress.kind === 'evidence') {
        validateDeclaredEvidence(change.progress.evidence);
        if (change.progress.evidence.reportId !== change.after.id || change.progress.evidence.declaredBy!==event.actorId
          || change.progress.evidence.version!==change.after.version || change.progress.evidence.declaredAt!==event.occurredAt
          || change.progress.evidence.target.activityId!==change.after.activityId) throw new InvalidValueError();
      } else if (change.action === 'poc:report-submitted' && change.progress.kind === 'submission') {
        validateSubmission(change.progress.submission);
        if (change.progress.submission.report.id !== change.after.id || change.progress.submission.submittedBy!==event.actorId
          || change.progress.submission.submittedAt!==event.occurredAt
          || JSON.stringify(change.progress.submission.report)!==JSON.stringify(change.after)) throw new InvalidValueError();
      } else throw new InvalidValueError();
    }
  }
}
export function validateSubmission(value: SubmittedReport): void {
  validateReport(value.report); version(value.report.version); entityId('user',value.submittedBy); utcInstant(value.submittedAt);
  if(value.from !== 'Abierto' || value.state !== 'Enviado' || !Array.isArray(value.evidence)) throw new InvalidValueError();
  for(const item of value.evidence){
    validateDeclaredEvidence(item.declaration); validateVerifiedFile(item.file);
    if(item.status !== 'valid-for-submission' || item.declaration.reportId !== value.report.id || item.declaration.target.activityId!==value.report.activityId
      || item.file.storageReference !== item.declaration.storageReference || item.file.mediaType !== item.declaration.mediaType
      || item.file.sizeBytes !== item.declaration.sizeBytes || item.file.authorizedForReportId!==value.report.id
      || item.file.authorizedForUserId!==value.submittedBy) throw new InvalidValueError();
  }
}

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
  evidence: Map<string, DeclaredEvidence>;
  submissions: Map<string, SubmittedReport>;
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
  for (const row of seed.users ?? []) validateUser(row);
  for (const row of seed.dependencies ?? []) { entityId('dependency', row.id); version(row.version); }
  for (const row of seed.fichas ?? []) {
    entityId('ficha', row.id); entityId('dependency', row.dependencyId); version(row.version);
  }
  for (const row of seed.activities ?? []) {
    entityId('activity', row.id); entityId('ficha', row.fichaId); version(row.version);
  }
  for (const row of seed.assignments ?? []) validateAssignment(row);
  for (const row of seed.reports ?? []) { validateReport(row); version(row.version); }
  const state: MemoryState = {
    users: table(seed.users), dependencies: table(seed.dependencies), fichas: table(seed.fichas),
    assignments: table(seed.assignments), activities: table(seed.activities), reports: table(seed.reports),
    audit: new Map(), idempotency: new Map(), evidence: new Map(), submissions: new Map(),
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
