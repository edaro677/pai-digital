import { createLocalJWKSet, errors } from 'jose';
import type { CryptoKey, JSONWebKeySet, LocalJWKSet } from 'jose';
import type { Clock } from '../../application/ports/clock.js';
import type { IdentityConfiguration } from './config.js';
import { validateConfiguration } from './config.js';
import { AuthenticationError, IdentityConfigurationError } from './errors.js';

export interface SigningKeyProvider {
  resolve(kid: string): Promise<CryptoKey>;
}

export interface JwksOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly clock: Clock;
  readonly cacheMaxAgeMs?: number;
  readonly cooldownMs?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Instancia por configuración confiable; no recibe URLs del token. Sin I/O al construir. */
export function createTrustedJwksProvider(input: IdentityConfiguration, options: JwksOptions): SigningKeyProvider {
  const config = validateConfiguration(input);
  const fetcher = options.fetch ?? globalThis.fetch;
  const ttl = options.cacheMaxAgeMs ?? 600000;
  const cooldown = options.cooldownMs ?? 30000;
  if (!Number.isSafeInteger(ttl) || !Number.isSafeInteger(cooldown)
      || ttl < 1000 || ttl > 3600000 || cooldown < 1000 || cooldown > ttl) {
    throw new IdentityConfigurationError();
  }
  let cache: { keys: LocalJWKSet; at: number } | undefined;
  let lastAttempt = -Infinity;
  let pending: Promise<void> | undefined;

  function now(): number {
    const value = Date.parse(options.clock.now());
    if (!Number.isFinite(value)) throw new AuthenticationError('KEYS_UNAVAILABLE');
    return value;
  }

  async function json(url: string): Promise<unknown> {
    // redirect:error impide que un endpoint permitido redirija a otro origen.
    const response = await fetcher(url, {
      redirect: 'error', credentials: 'omit', cache: 'no-store',
      signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' },
    });
    if (!response.ok || response.redirected || (response.url && response.url !== url)
        || !/^(application\/json|application\/jwk-set\+json)(;|$)/i.test(response.headers.get('content-type') ?? '')
        || !response.body) throw new AuthenticationError('KEYS_UNAVAILABLE');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 1048576) throw new AuthenticationError('KEYS_UNAVAILABLE');
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }

  async function refresh(): Promise<void> {
    if (pending) return pending;
    const at = now();
    if (at - lastAttempt < cooldown) throw new AuthenticationError('KEYS_UNAVAILABLE');
    lastAttempt = at;
    pending = (async () => {
      const metadata = await json(config.metadataUrl);
      if (!record(metadata) || metadata.issuer !== config.issuer || metadata.jwks_uri !== config.jwksUrl) {
        throw new AuthenticationError('KEYS_UNAVAILABLE');
      }
      const jwks = await json(config.jwksUrl);
      if (!record(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.length > 100) {
        throw new AuthenticationError('KEYS_UNAVAILABLE');
      }
      const keys = jwks.keys.filter((key: unknown) => {
        if (!record(key) || key.kty !== 'RSA' || (key.use !== undefined && key.use !== 'sig')
            || (key.alg !== undefined && key.alg !== 'RS256')) return false;
        if (typeof key.kid !== 'string' || key.kid.length === 0 || key.kid.length > 256
            || typeof key.n !== 'string' || typeof key.e !== 'string'
            || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k', 'jku', 'x5u'].some((name) => name in key)) {
          throw new AuthenticationError('KEYS_UNAVAILABLE');
        }
        if (key.issuer !== undefined && key.issuer !== config.issuer
            && key.issuer !== 'https://login.microsoftonline.com/{tenantid}/v2.0') {
          throw new AuthenticationError('KEYS_UNAVAILABLE');
        }
        return true;
      });
      if (keys.length === 0) throw new AuthenticationError('KEYS_UNAVAILABLE');
      cache = { keys: createLocalJWKSet({ keys } as JSONWebKeySet), at: now() };
    })();
    try { await pending; }
    catch { throw new AuthenticationError('KEYS_UNAVAILABLE'); }
    finally { pending = undefined; }
  }

  return Object.freeze({
    async resolve(kid: string): Promise<CryptoKey> {
      try {
        const at = now();
        if (!cache || at < cache.at || at - cache.at >= ttl) await refresh();
        try { return await cache!.keys({ alg: 'RS256', kid }); }
        catch (error) {
          if (!(error instanceof errors.JWKSNoMatchingKey)) throw error;
          if (now() - lastAttempt < cooldown) throw new AuthenticationError('UNKNOWN_KEY');
          await refresh();
          try { return await cache!.keys({ alg: 'RS256', kid }); }
          catch (retryError) {
            if (retryError instanceof errors.JWKSNoMatchingKey) throw new AuthenticationError('UNKNOWN_KEY');
            throw retryError;
          }
        }
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        throw new AuthenticationError('KEYS_UNAVAILABLE');
      }
    },
  });
}
