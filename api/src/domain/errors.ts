export type DomainErrorCode =
  | 'NOT_FOUND' | 'ACCESS_DENIED' | 'VERSION_CONFLICT'
  | 'DUPLICATE' | 'INCOMPATIBLE_STATE' | 'INVALID_VALUE';

/** Sin códigos HTTP, detalles de infraestructura ni datos del recurso. */
export abstract class DomainError extends Error {
  protected constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor() { super('NOT_FOUND', 'Recurso no encontrado.'); }
}
export class AccessDeniedError extends DomainError {
  constructor() { super('ACCESS_DENIED', 'Operación no permitida.'); }
}
export class VersionConflictError extends DomainError {
  constructor() { super('VERSION_CONFLICT', 'La versión esperada no es la vigente.'); }
}
export class DuplicateError extends DomainError {
  constructor() { super('DUPLICATE', 'La identidad o clave única ya existe.'); }
}
export class IncompatibleStateError extends DomainError {
  constructor() { super('INCOMPATIBLE_STATE', 'El estado técnico es incompatible con la operación.'); }
}
export class InvalidValueError extends DomainError {
  constructor() { super('INVALID_VALUE', 'Representación técnica inválida.'); }
}
