import { IdentityConfigurationError } from './errors.js';

export interface IdentityConfiguration {
  readonly tenantId: string;
  readonly audience: string;
  readonly requiredScope: string;
  readonly metadataUrl: string;
  readonly jwksUrl: string;
  readonly tokenVersion: '2.0';
  readonly clockToleranceSeconds: number;
}

export interface ValidatedConfiguration extends IdentityConfiguration {
  readonly issuer: string;
}

export function isGuid(value: unknown): value is string {
  return typeof value === 'string'
    && value.length === 36
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    && value !== '00000000-0000-0000-0000-000000000000';
}

export function isScope(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[^\x21\x23-\x5b\x5d-\x7e]/.test(value);
}

/** Sin lectura de entorno, defaults de tenant ni descubrimiento basado en el JWT. */
export function validateConfiguration(input: IdentityConfiguration): Readonly<ValidatedConfiguration> {
  if (!input || !isGuid(input.tenantId) || !isGuid(input.audience)
      || !isScope(input.requiredScope) || input.requiredScope.length > 200
      || ['openid', 'profile', 'email', 'offline_access'].includes(input.requiredScope)
      || input.tokenVersion !== '2.0' || !Number.isInteger(input.clockToleranceSeconds)
      || input.clockToleranceSeconds < 0 || input.clockToleranceSeconds > 60
      || input.audience.toLowerCase() === '00000003-0000-0000-c000-000000000000') {
    throw new IdentityConfigurationError();
  }
  const tenantId = input.tenantId.toLowerCase();
  const base = `https://login.microsoftonline.com/${tenantId}`;
  if (input.metadataUrl !== `${base}/v2.0/.well-known/openid-configuration`
      || input.jwksUrl !== `${base}/discovery/v2.0/keys`) {
    throw new IdentityConfigurationError();
  }
  return Object.freeze({
    tenantId, audience: input.audience.toLowerCase(), requiredScope: input.requiredScope,
    metadataUrl: input.metadataUrl, jwksUrl: input.jwksUrl, tokenVersion: '2.0',
    clockToleranceSeconds: input.clockToleranceSeconds, issuer: `${base}/v2.0`,
  });
}
