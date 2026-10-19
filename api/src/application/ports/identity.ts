import type { DirectoryObjectId, TenantId, UtcInstant } from '../../domain/types.js';

/** Resultado de verificación, no un usuario persistido ni una concesión por ficha. */
export interface AuthenticatedIdentity {
  readonly tenantId: TenantId;
  readonly objectId: DirectoryObjectId;
  readonly subjectKey: string;
  readonly clientId: string;
  readonly issuer: string;
  readonly audience: string;
  readonly scopes: readonly string[];
  readonly expiresAt: UtcInstant;
}

export interface IdentityValidator {
  validateAuthorization(value: string | readonly string[] | null | undefined): Promise<AuthenticatedIdentity>;
}
