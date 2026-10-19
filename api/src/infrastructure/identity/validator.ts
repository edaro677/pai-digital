import { decodeProtectedHeader, errors, jwtVerify } from 'jose';
import type { IdentityValidator } from '../../application/ports/identity.js';
import type { Clock } from '../../application/ports/clock.js';
import { utcInstant } from '../../domain/types.js';
import { extractBearer } from './bearer.js';
import { validateConfiguration } from './config.js';
import type { IdentityConfiguration } from './config.js';
import { AuthenticationError } from './errors.js';
import { createTrustedJwksProvider } from './keys.js';
import type { SigningKeyProvider } from './keys.js';
import { normalizeIdentity } from './normalize.js';

export interface ValidatorDependencies {
  readonly clock?: Clock;
  readonly keyProvider?: SigningKeyProvider;
}

/** Construir desde código confiable, nunca a partir de headers o claims del cliente. */
export function createEntraIdentityValidator(input: IdentityConfiguration, dependencies: ValidatorDependencies = {}): IdentityValidator {
  const config = validateConfiguration(input);
  const clock = dependencies.clock ?? { now: () => utcInstant(new Date().toISOString()) };
  const provider = dependencies.keyProvider ?? createTrustedJwksProvider(config, { clock });
  return Object.freeze({
    async validateAuthorization(value: string | readonly string[] | null | undefined) {
      try {
        const token = extractBearer(value);
        // Solo header para seleccionar una clave previamente confiable; aún no hay identidad.
        const header = decodeProtectedHeader(token);
        if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid
            || header.kid.length > 256 || /\s/.test(header.kid)
            || (header.typ !== undefined && header.typ !== 'JWT')
            || ['jku', 'x5u', 'jwk', 'x5c'].some((name) => name in header)) {
          throw new AuthenticationError('INVALID_TOKEN');
        }
        const key = await provider.resolve(header.kid);
        const algorithm = key.algorithm as { name: string; modulusLength?: number; hash?: { name?: string } };
        if (key.type !== 'public' || algorithm.name !== 'RSASSA-PKCS1-v1_5'
            || typeof algorithm.modulusLength !== 'number' || algorithm.modulusLength < 2048
            || algorithm.hash?.name !== 'SHA-256') {
          throw new AuthenticationError('INVALID_TOKEN');
        }
        const currentDate = new Date(clock.now());
        if (!Number.isFinite(currentDate.getTime())) throw new AuthenticationError('INVALID_TOKEN');
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['RS256'], issuer: config.issuer, audience: config.audience,
          requiredClaims: ['iss', 'aud', 'exp', 'nbf', 'tid', 'oid', 'scp', 'ver', 'azp'],
          clockTolerance: config.clockToleranceSeconds, currentDate,
        });
        return normalizeIdentity(payload, config);
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        if (error instanceof errors.JWTExpired) throw new AuthenticationError('TOKEN_EXPIRED');
        if (error instanceof errors.JWTClaimValidationFailed && error.claim === 'nbf') {
          throw new AuthenticationError('TOKEN_NOT_ACTIVE');
        }
        throw new AuthenticationError('INVALID_TOKEN');
      }
    },
  });
}
