import { AccessDeniedError, DomainError, DuplicateError, IncompatibleStateError,
  InvalidValueError, NotFoundError, VersionConflictError } from '../../domain/errors.js';

export type SqlInfrastructureCode =
  | 'SQL_SCHEMA_INCOMPATIBLE' | 'SQL_CODEC_INVALID' | 'SQL_CONNECT_FAILED' | 'SQL_BEGIN_FAILED'
  | 'SQL_QUERY_FAILED' | 'SQL_COMMIT_OUTCOME_UNKNOWN' | 'SQL_ROLLBACK_FAILED'
  | 'SQL_CLOSE_FAILED' | 'SQL_WORK_FAILED' | 'SQL_SESSION_CLOSED'
  | 'SQL_SESSION_BUSY' | 'SQL_SESSION_PENDING' | 'SQL_SESSION_NESTED';

const codes: readonly SqlInfrastructureCode[] = ['SQL_SCHEMA_INCOMPATIBLE', 'SQL_CODEC_INVALID', 'SQL_CONNECT_FAILED',
  'SQL_BEGIN_FAILED', 'SQL_QUERY_FAILED', 'SQL_COMMIT_OUTCOME_UNKNOWN', 'SQL_ROLLBACK_FAILED',
  'SQL_CLOSE_FAILED', 'SQL_WORK_FAILED', 'SQL_SESSION_CLOSED', 'SQL_SESSION_BUSY',
  'SQL_SESSION_PENDING', 'SQL_SESSION_NESTED'];

/** Sin datos, causa, mensaje del controlador ni rutas en la excepcion publica. */
export class SqlInfrastructureError extends Error {
  readonly code: SqlInfrastructureCode;
  readonly transactionOutcome?: 'unknown' | 'committed';
  constructor(code: SqlInfrastructureCode, outcome?: 'unknown' | 'committed') {
    const allowed = codes.includes(code) ? code : 'SQL_WORK_FAILED';
    super(allowed === 'SQL_COMMIT_OUTCOME_UNKNOWN'
      ? 'No se conoce el resultado del commit SQL; podria haberse aplicado.'
      : 'La operacion de infraestructura SQL no pudo completarse.');
    this.name = 'SqlInfrastructureError';
    this.code = allowed;
    if (allowed === 'SQL_COMMIT_OUTCOME_UNKNOWN') this.transactionOutcome = 'unknown';
    else if (outcome === 'unknown' || outcome === 'committed') this.transactionOutcome = outcome;
    delete this.stack;
  }
}

export type SqlSessionFailure = SqlInfrastructureError | DomainError;

/** Conservar errores conocidos del callback sin copiar sus mensajes o detalles.
 * Los fallos del transporte se clasifican aparte, nunca como errores de negocio. */
function classifyWorkError(error: unknown): SqlSessionFailure {
  if (error instanceof SqlInfrastructureError) return new SqlInfrastructureError(error.code, error.transactionOutcome);
  if (error instanceof DomainError) {
    let safe: DomainError;
    switch (error.code) {
      case 'NOT_FOUND': safe = new NotFoundError(); break;
      case 'ACCESS_DENIED': safe = new AccessDeniedError(); break;
      case 'VERSION_CONFLICT': safe = new VersionConflictError(); break;
      case 'DUPLICATE': safe = new DuplicateError(); break;
      case 'INCOMPATIBLE_STATE': safe = new IncompatibleStateError(); break;
      case 'INVALID_VALUE': safe = new InvalidValueError(); break;
      default: return new SqlInfrastructureError('SQL_WORK_FAILED');
    }
    delete safe.stack;
    return safe;
  }
  return new SqlInfrastructureError('SQL_WORK_FAILED');
}


export function sanitizeWorkError(error: unknown): SqlSessionFailure {
  try { return classifyWorkError(error); }
  catch { return new SqlInfrastructureError('SQL_WORK_FAILED'); }
}
