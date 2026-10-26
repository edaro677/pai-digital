import type {
  AccessAssignment, Activity, AuditEvent, CompletedIdempotency, Ficha,
  IdempotencyRecord, IdempotencyScope, InstitutionalUser, Report,
  ReportOperationOutcome, ReservedIdempotency,
} from '../../domain/entities.js';
import type {
  ActivityId, AssignmentId, AuditEventId, DirectoryObjectId, FichaId,
  IdempotencyRecordId, PeriodKey, ReportId, RequestFingerprint,
  TenantId, UserId, UtcInstant, Version,
} from '../../domain/types.js';

/** Lecturas: null si no existe; listas vacías si no hay coincidencias. Sin política de acceso. */
export interface UserRepository {
  findById(id: UserId): Promise<InstitutionalUser | null>;
  findByIdentity(tenantId: TenantId, directoryObjectId: DirectoryObjectId): Promise<InstitutionalUser | null>;
  setEnabled(id: UserId, expectedVersion: Version, enabled: boolean): Promise<InstitutionalUser>;
}

export interface AssignmentRepository {
  findById(id: AssignmentId): Promise<AccessAssignment | null>;
  /** Discovery only; application authorization still evaluates every assignment/ficha. */
  listByUser(userId: UserId): Promise<readonly AccessAssignment[]>;
  /** Devuelve también deshabilitadas/fuera de ventana: la política futura decide su vigencia. */
  listByUserAndFicha(userId: UserId, fichaId: FichaId): Promise<readonly AccessAssignment[]>;
  setEnabled(id: AssignmentId, expectedVersion: Version, enabled: boolean): Promise<AccessAssignment>;
}

export interface FichaRepository {
  findById(id: FichaId): Promise<Ficha | null>;
  findByIds(ids: readonly FichaId[]): Promise<readonly Ficha[]>;
}

export interface ActivityRepository {
  findById(id: ActivityId): Promise<Activity | null>;
  listByFicha(fichaId: FichaId): Promise<readonly Activity[]>;
}

export type NewReport = Omit<Report, 'version'>;
export type ReportChanges = Pick<Report, 'quantity' | 'narrative' | 'state' | 'updatedBy' | 'updatedAt'>;

export interface ReportRepository {
  findById(id: ReportId): Promise<Report | null>;
  findByActivityAndPeriod(activityId: ActivityId, period: PeriodKey): Promise<Report | null>;
  /** Duplicado por ID o por (actividad, periodo); versión nueva generada por el adaptador. */
  create(input: NewReport): Promise<Report>;
  /** Cambio parcial explícito; nunca cambia ID, actividad, periodo o autor de creación. */
  update(id: ReportId, expectedVersion: Version, changes: ReportChanges): Promise<Report>;
}

export interface AuditRepository {
  /** Append-only: rechazar ID existente, sin update/delete ni commit independiente. */
  append(event: AuditEvent): Promise<void>;
  findById(id: AuditEventId): Promise<AuditEvent | null>;
}

export interface NewReservation {
  readonly id: IdempotencyRecordId;
  readonly scope: IdempotencyScope;
  readonly requestFingerprint: RequestFingerprint;
  readonly createdAt: UtcInstant;
}

export interface IdempotencyRepository {
  findByScope(scope: IdempotencyScope): Promise<IdempotencyRecord | null>;
  /** Unicidad por ID y scope completo. No sobrescribir una reserva existente. */
  reserve(input: NewReservation): Promise<ReservedIdempotency>;
  /** Solo desde reserved y con versión vigente; no modificar una operación completada. */
  complete(id: IdempotencyRecordId, expectedVersion: Version, outcome: ReportOperationOutcome, completedAt: UtcInstant): Promise<CompletedIdempotency>;
}
