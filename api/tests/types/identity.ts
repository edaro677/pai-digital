import type { AuthenticatedIdentity, IdentityValidator } from '../../src/application/ports/identity.js';
import type { DirectoryObjectId, TenantId } from '../../src/domain/types.js';

declare const identity: AuthenticatedIdentity;
declare const validator: IdentityValidator;
declare function tenant(value: TenantId): void;
declare function object(value: DirectoryObjectId): void;
tenant(identity.tenantId);
object(identity.objectId);
const validation: Promise<AuthenticatedIdentity> = validator.validateAuthorization(null);
void validation;
// @ts-expect-error No se reemplaza identidad por encabezados personalizados.
void validator.validateAuthorization({ 'X-User': 'untrusted' });
// @ts-expect-error La identidad normalizada es readonly.
identity.objectId = 'untrusted';
// @ts-expect-error Los scopes no son capacidades de negocio mutables.
identity.scopes.push('poc:edit-report');
// @ts-expect-error La identidad no contiene contraseñas o tokens originales.
void identity.accessToken;
