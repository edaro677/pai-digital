export type AuthenticationErrorCode = 'INVALID_AUTHORIZATION' | 'INVALID_TOKEN' | 'INVALID_CLAIMS'
  | 'TOKEN_EXPIRED' | 'TOKEN_NOT_ACTIVE' | 'UNKNOWN_KEY' | 'KEYS_UNAVAILABLE';

/** Nunca adjuntar JWT, claims, errores externos ni respuestas de red. */
export class AuthenticationError extends Error {
  constructor(public readonly code: AuthenticationErrorCode) {
    super('No fue posible validar la identidad de acceso.');
    this.name = 'AuthenticationError';
  }
}

export class IdentityConfigurationError extends Error {
  readonly code = 'IDENTITY_CONFIGURATION';
  constructor() {
    super('Configuración de identidad incompleta o no admitida.');
    this.name = 'IdentityConfigurationError';
  }
}
