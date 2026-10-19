import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { utcInstant } from '../../.local-build/domain/types.js';
import { createTrustedJwksProvider } from '../../.local-build/infrastructure/identity/keys.js';
import { createEntraIdentityValidator } from '../../.local-build/infrastructure/identity/validator.js';

// Claves privadas efímeras: solo memoria del proceso de pruebas, nunca archivos.
export const firstKey = await generateKeyPair('RS256');
export const secondKey = await generateKeyPair('RS256');
export const ecKey = await generateKeyPair('ES256');
export const firstPublic = { ...await exportJWK(firstKey.publicKey), kid: 'local-key-one', alg: 'RS256', use: 'sig' };
export const secondPublic = { ...await exportJWK(secondKey.publicKey), kid: 'local-key-two', alg: 'RS256', use: 'sig' };

export const configuration = Object.freeze({
  tenantId: '11111111-1111-4111-8111-111111111111',
  audience: '22222222-2222-4222-8222-222222222222',
  requiredScope: 'poc.access', tokenVersion: '2.0', clockToleranceSeconds: 30,
  allowedClientIds: Object.freeze(['44444444-4444-4444-8444-444444444444']),
  metadataUrl: 'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0/.well-known/openid-configuration',
  jwksUrl: 'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/discovery/v2.0/keys',
});
export const issuer = `https://login.microsoftonline.com/${configuration.tenantId}/v2.0`;
export const epoch = Date.parse('2000-01-01T00:00:00.000Z');
export const objectId = '3a3b3c3d-3333-4333-8333-333333333333';
export const clientId = '44444444-4444-4444-8444-444444444444';

export function claims(overrides = {}) {
  return {
    iss: issuer, aud: configuration.audience, tid: configuration.tenantId,
    oid: objectId, azp: clientId, ver: '2.0', scp: 'poc.access extra.read',
    nbf: epoch / 1000 - 60, exp: epoch / 1000 + 300,
    ...overrides,
  };
}

export async function signedToken(overrides = {}, header = {}, key = firstKey.privateKey) {
  return new SignJWT(claims(overrides)).setProtectedHeader({ alg: 'RS256', kid: firstPublic.kid, typ: 'JWT', ...header }).sign(key);
}

export function harness(options = {}) {
  let time = epoch;
  let keys = [firstPublic];
  let metadata = { issuer, jwks_uri: configuration.jwksUrl };
  let failure = false;
  const calls = [];
  const clock = { now: () => utcInstant(new Date(time).toISOString()) };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (failure) throw new Error('synthetic-sensitive-network-detail');
    if (url !== configuration.metadataUrl && url !== configuration.jwksUrl) throw new Error('Unexpected URL');
    if (options.response) return options.response(url, init);
    return new Response(JSON.stringify(url === configuration.metadataUrl ? metadata : { keys }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const provider = createTrustedJwksProvider(configuration, {
    clock, fetch, cacheMaxAgeMs: options.cacheMaxAgeMs ?? 600000, cooldownMs: options.cooldownMs ?? 30000,
  });
  return {
    clock, provider, calls,
    validator: createEntraIdentityValidator(configuration, { clock, keyProvider: provider }),
    advance: (milliseconds) => { time += milliseconds; },
    setKeys: (value) => { keys = value; },
    setMetadata: (value) => { metadata = value; },
    fail: (value = true) => { failure = value; },
  };
}
