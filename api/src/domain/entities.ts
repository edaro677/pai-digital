import type {
  ActivityId, AssignmentId, AuditEventId, Capability, CorrelationId, DecimalText,
  DependencyId, DirectoryObjectId, FichaId, IdempotencyKey, IdempotencyRecordId,
  IdempotentOperation, PeriodKey, ReportId, ReportState, RequestFingerprint,
  TenantId, UserId, UtcInstant, Version,
} from './types.js';

/** Todas las entidades describen registros sintéticos, no un esquema institucional. */
export interface InstitutionalUser {
  readonly id: UserId;
  readonly tenantId: TenantId;
  readonly directoryObjectId: DirectoryObjectId;
  readonly alias: string;
  readonly enabled: boolean;
  readonly version: Version;
}

export interface Dependency {
  readonly id: DependencyId;
  readonly label: string;
  readonly version: Version;
}

export interface Ficha {
  readonly id: FichaId;
  readonly dependencyId: DependencyId;
  readonly cycleLabel: string;
  readonly version: Version;
}

export interface AccessAssignment {
  readonly id: AssignmentId;
  readonly userId: UserId;
  readonly fichaId: FichaId;
  readonly capability: Capability;
  readonly enabled: boolean;
  readonly validFrom: UtcInstant;
  readonly validUntil: UtcInstant | null;
  readonly version: Version;
}

export interface Activity {
  readonly id: ActivityId;
  readonly fichaId: FichaId;
  readonly description: string;
  readonly version: Version;
}

/** Un detalle técnico por actividad/periodo, no la cabecera de reporte de PAI-005. */
export interface Report {
  readonly id: ReportId;
  readonly activityId: ActivityId;
  readonly period: PeriodKey;
  readonly quantity: DecimalText | null;
  readonly narrative: string;
  readonly state: ReportState;
  readonly createdBy: UserId;
  readonly createdAt: UtcInstant;
  readonly updatedBy: UserId;
  readonly updatedAt: UtcInstant;
  readonly version: Version;
}

export type AuditChange =
  | { readonly action: 'poc:report-created'; readonly before: null; readonly after: Report }
  | { readonly action: 'poc:report-updated'; readonly before: Report; readonly after: Report }
  | { readonly action: 'poc:user-enabled-changed'; readonly before: InstitutionalUser; readonly after: InstitutionalUser }
  | { readonly action: 'poc:assignment-enabled-changed'; readonly before: AccessAssignment; readonly after: AccessAssignment };

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly actorId: UserId;
  readonly occurredAt: UtcInstant;
  readonly correlationId: CorrelationId;
  readonly change: AuditChange;
}

export interface IdempotencyScope {
  readonly actorId: UserId;
  readonly operation: IdempotentOperation;
  readonly key: IdempotencyKey;
}

export interface ReportOperationOutcome {
  readonly report: Report;
  readonly auditEventId: AuditEventId;
}

interface IdempotencyBase {
  readonly id: IdempotencyRecordId;
  readonly scope: IdempotencyScope;
  readonly requestFingerprint: RequestFingerprint;
  readonly createdAt: UtcInstant;
  readonly version: Version;
}

export interface ReservedIdempotency extends IdempotencyBase {
  readonly state: 'poc:reserved';
  readonly outcome: null;
  readonly completedAt: null;
}

export interface CompletedIdempotency extends IdempotencyBase {
  readonly state: 'poc:completed';
  readonly outcome: ReportOperationOutcome;
  readonly completedAt: UtcInstant;
}

export type IdempotencyRecord = ReservedIdempotency | CompletedIdempotency;
