import type { JWTPayload } from 'jose';
import type { AuthenticatedIdentity } from '../../application/ports/identity.js';
import { entityId, utcInstant } from '../../domain/types.js';
import { isGuid, isScope } from './config.js';
import type { ValidatedConfiguration } from './config.js';
import { AuthenticationError } from './errors.js';

/** Uso interno después de jwtVerify. No usar como verificador de payloads externos. */
export function normalizeIdentity(payload: JWTPayload, config: ValidatedConfiguration): AuthenticatedIdentity {
  if (payload.ver !== '2.0' || payload.tid !== config.tenantId || !isGuid(payload.oid)
      || !isGuid(payload.azp) || payload.aud !== config.audience || payload.iss !== config.issuer
      || payload.idtyp === 'app' || typeof payload.scp !== 'string'
      || !config.allowedClientIds.includes(payload.azp.toLowerCase())
      || !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.nbf)
      || payload.nbf! >= payload.exp!) throw new AuthenticationError('INVALID_CLAIMS');
  const scopes = payload.scp.split(' ');
  if (!scopes.every(isScope) || !scopes.includes(config.requiredScope)) throw new AuthenticationError('INVALID_CLAIMS');
  const tenantId = entityId('tenant', config.tenantId);
  const objectId = entityId('directory-object', payload.oid.toLowerCase());
  return Object.freeze({
    tenantId, objectId, subjectKey: `${tenantId}:${objectId}`,
    clientId: payload.azp.toLowerCase(), issuer: config.issuer, audience: config.audience,
    scopes: Object.freeze([...new Set(scopes)].sort()),
    expiresAt: utcInstant(new Date(payload.exp! * 1000).toISOString()),
  });
}
