import type {
  ActivityRepository, AssignmentRepository, AuditRepository, FichaRepository,
  IdempotencyRepository, ReportRepository, UserRepository,
} from './repositories.js';
import type { ProgressRepository } from './progress.js';

/** Repositorios ligados al mismo contexto; no retenerlos después del callback. */
export interface TransactionContext {
  readonly users: UserRepository;
  readonly assignments: AssignmentRepository;
  readonly fichas: FichaRepository;
  readonly activities: ActivityRepository;
  readonly reports: ReportRepository;
  readonly audit: AuditRepository;
  readonly idempotency: IdempotencyRepository;
  readonly progress?: ProgressRepository;
}

/**
 * Contrato, no implementación:
 * - Aislamiento serializable o validación equivalente al confirmar, incluyendo lecturas
 *   de usuario, asignaciones (también ausencia de filas), relaciones y versiones.
 * - La política futura lee usuario/asignaciones en ESTE contexto antes de escribir.
 * - Escritura, auditoría y reserva/completado de idempotencia se confirman juntos.
 * - Una excepción revierte todo; resolver la promesa ocurre después de confirmar.
 * - No hay commits por repositorio, transacciones anidadas, efectos externos ni reintentos
 *   automáticos del callback. Un conflicto exige una nueva ejecución deliberada.
 * No ejecuta autorización ni garantiza auditoría por el mero hecho de ser una interfaz.
 */
export interface UnitOfWork {
  runAtomic<Result>(work: (context: TransactionContext) => Promise<Result>): Promise<Result>;
}
