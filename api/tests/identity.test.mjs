import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, UnsecuredJWT } from 'jose';
import { AuthenticationError, IdentityConfigurationError } from '../.local-build/infrastructure/identity/errors.js';
import { validateConfiguration } from '../.local-build/infrastructure/identity/config.js';
import { createEntraIdentityValidator } from '../.local-build/infrastructure/identity/validator.js';
import { extractBearer } from '../.local-build/infrastructure/identity/bearer.js';
import {
  configuration, issuer, epoch, objectId, clientId, claims, signedToken,
  firstKey, secondKey, ecKey, firstPublic, secondPublic, harness,
} from './fixtures/identity.mjs';

let originalFetch;
let blockedRequests = 0;
before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { blockedRequests++; throw new Error('Network disabled for identity tests'); };
});
after(() => { globalThis.fetch = originalFetch; });

async function rejectsIdentity(operation, token, expectedCode) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof AuthenticationError);
    if (expectedCode) assert.equal(error.code, expectedCode);
    const serialized = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;
    if (token) assert.ok(!serialized.includes(token));
    assert.ok(!serialized.includes('synthetic-sensitive'));
    assert.equal('cause' in error, false);
    return true;
  });
}

test('JWT válido: normaliza tid/oid y no usa datos de correo ni roles', async () => {
  const h = harness();
  const jwt = await signedToken({ oid: objectId.toUpperCase(), email: 'synthetic-sensitive-email', preferred_username: 'synthetic-sensitive-name', upn: 'synthetic-sensitive-upn', roles: ['synthetic-role'] });
  const identity = await h.validator.validateAuthorization(`Bearer ${jwt}`);
  assert.equal(identity.subjectKey, `${configuration.tenantId}:${objectId}`);
  assert.equal(identity.tenantId, configuration.tenantId);
  assert.equal(identity.objectId, objectId);
  assert.equal(identity.clientId, clientId);
  assert.equal(identity.issuer, issuer);
  assert.equal(identity.audience, configuration.audience);
  assert.deepEqual(identity.scopes, ['extra.read', 'poc.access']);
  assert.equal(identity.expiresAt, '2000-01-01T00:05:00.000Z');
  assert.ok(!JSON.stringify(identity).includes('synthetic-sensitive'));
  assert.ok(!('roles' in identity));
  assert.throws(() => { identity.scopes.push('untrusted'); }, TypeError);
  assert.throws(() => { identity.subjectKey = 'untrusted'; }, TypeError);
});

for (const [label, override, expected] of [
  ['expirado', { exp: epoch / 1000 - 31 }, 'TOKEN_EXPIRED'],
  ['nbf futuro', { nbf: epoch / 1000 + 31 }, 'TOKEN_NOT_ACTIVE'],
  ['emisor incorrecto', { iss: 'https://synthetic.invalid' }],
  ['audiencia incorrecta', { aud: '66666666-6666-4666-8666-666666666666' }],
  ['Graph', { aud: '00000003-0000-0000-c000-000000000000' }],
  ['ID token para SPA', { aud: '55555555-5555-4555-8555-555555555555', scp: undefined }],
  ['otro tenant', { tid: '77777777-7777-4777-8777-777777777777' }],
  ['oid ausente', { oid: undefined }], ['oid inválido', { oid: 'not-a-guid' }],
  ['oid con salto de línea', { oid: `${objectId}\n` }],
  ['scope ausente', { scp: undefined }], ['scope incorrecto', { scp: 'other.access' }],
  ['scope parcial', { scp: 'poc.access.extra' }], ['scope mal tipado', { scp: ['poc.access'] }],
  ['scope con salto de línea', { scp: 'extra.read\n poc.access' }],
  ['v1 no soportado', { ver: '1.0' }], ['versión ausente', { ver: undefined }],
  ['app-only con roles', { scp: undefined, roles: ['access'] }],
  ['idtyp app aunque tenga scp', { idtyp: 'app' }],
  ['audiencia como lista', { aud: [configuration.audience] }],
  ['azp ausente', { azp: undefined }], ['exp ausente', { exp: undefined }],
  ['nbf ausente', { nbf: undefined }], ['intervalo invertido', { nbf: epoch / 1000 + 10, exp: epoch / 1000 + 5 }],
]) {
  test(`rechaza ${label}`, async () => {
    const h = harness(); const jwt = await signedToken(override);
    await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt, expected);
  });
}

test('firma y payload alterados se rechazan sin confiar en sus claims', async () => {
  const h = harness(); const jwt = await signedToken();
  const parts = jwt.split('.');
  const signature = [...parts]; signature[2] = (signature[2][0] === 'A' ? 'B' : 'A') + signature[2].slice(1);
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${signature.join('.')}`), signature.join('.'));
  const payload = [...parts]; payload[1] = Buffer.from(JSON.stringify(claims({ oid: '88888888-8888-4888-8888-888888888888' }))).toString('base64url');
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${payload.join('.')}`), payload.join('.'));
  const attacker = await signedToken({}, {}, secondKey.privateKey);
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${attacker}`), attacker);
});

test('rechaza none, HMAC y ES256 sin consultar claves', async () => {
  const h = harness();
  const tokens = [
    new UnsecuredJWT(claims()).encode(),
    await new SignJWT(claims()).setProtectedHeader({ alg: 'HS256', kid: firstPublic.kid }).sign(crypto.getRandomValues(new Uint8Array(32))),
    await signedToken({}, { alg: 'ES256' }, ecKey.privateKey),
  ];
  for (const jwt of tokens) await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt);
  assert.equal(h.calls.length, 0);
});

test('kid ausente/desconocido y referencias de claves en headers no se confían', async () => {
  const h = harness();
  const unknown = await signedToken({}, { kid: 'unknown' });
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${unknown}`), unknown, 'UNKNOWN_KEY');
  const count = h.calls.length;
  for (const header of [{ kid: undefined }, { kid: 'bad kid' }, { jku: 'https://synthetic.invalid/keys' }, { x5u: 'https://synthetic.invalid/cert' }, { jwk: firstPublic }]) {
    const jwt = await signedToken({}, header);
    await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt);
  }
  assert.equal(h.calls.length, count);
});

test('Bearer rechaza ausencia, listas, ambigüedad, controles y JWT malformados', async () => {
  const jwt = await signedToken(); const h = harness();
  const invalid = [undefined, null, '', `Basic ${jwt}`, `Bearer  ${jwt}`, ` Bearer ${jwt}`, `Bearer ${jwt} `,
    `Bearer\t${jwt}`, `Bearer ${jwt}\r\n`, `Bearer ${jwt}\n`, `Bearer ${jwt}\u2028`, `Bearer ${jwt}, Bearer ${jwt}`, [`Bearer ${jwt}`],
    [`Bearer ${jwt}`, `Bearer ${jwt}`], { 'X-User': objectId, 'X-Oid': objectId }, 'Bearer a.b.c', 'Bearer abc',
    `Bearer ${'a'.repeat(32769)}.b.c`];
  for (const value of invalid) await rejectsIdentity(h.validator.validateAuthorization(value), jwt);
  assert.equal(extractBearer(`bEaReR ${jwt}`), jwt);
  assert.equal(h.calls.length, 0);
});

test('configuración incompleta o endpoints no confiables fallan antes de red', () => {
  for (const key of Object.keys(configuration)) {
    const incomplete = { ...configuration }; delete incomplete[key];
    assert.throws(() => createEntraIdentityValidator(incomplete), IdentityConfigurationError);
  }
  for (const override of [
    { tenantId: 'organizations' }, { audience: 'https://graph.microsoft.com' },
    { audience: '00000003-0000-0000-c000-000000000000' }, { requiredScope: 'openid' },
    { requiredScope: 'two scopes' }, { tokenVersion: '1.0' }, { clockToleranceSeconds: -1 },
    { requiredScope: 'poc.access\n' }, { tenantId: `${configuration.tenantId}\n` },
    { clockToleranceSeconds: 61 }, { clockToleranceSeconds: NaN }, { clockToleranceSeconds: 0.5 },
    { metadataUrl: configuration.metadataUrl.replace('https:', 'http:') },
    { metadataUrl: configuration.metadataUrl.replace('login.microsoftonline.com', 'login.microsoftonline.com.synthetic.invalid') },
    { metadataUrl: configuration.metadataUrl.replace(configuration.tenantId, 'common') },
    { jwksUrl: configuration.jwksUrl + '?redirect=other' }, { jwksUrl: configuration.jwksUrl + '#fragment' },
    { jwksUrl: configuration.jwksUrl.replace('https://', 'https://user:password@') },
  ]) assert.throws(() => validateConfiguration({ ...configuration, ...override }), IdentityConfigurationError);
  assert.ok(Object.isFrozen(validateConfiguration(configuration)));
});

test('tolerancia configurable: dentro del margen se acepta y fuera se rechaza', async () => {
  const h = harness();
  for (const changes of [{ exp: epoch / 1000 - 29 }, { nbf: epoch / 1000 + 29 }]) {
    const jwt = await signedToken(changes);
    assert.ok(await h.validator.validateAuthorization(`Bearer ${jwt}`));
  }
  const strict = createEntraIdentityValidator({ ...configuration, clockToleranceSeconds: 0 }, { clock: h.clock, keyProvider: h.provider });
  const jwt = await signedToken({ exp: epoch / 1000 - 1 });
  await rejectsIdentity(strict.validateAuthorization(`Bearer ${jwt}`), jwt, 'TOKEN_EXPIRED');
});

test('metadatos con otro issuer o jwks_uri no descargan claves no confiables', async () => {
  const jwt = await signedToken();
  for (const metadata of [{ issuer, jwks_uri: 'https://synthetic.invalid/keys' },
    { issuer: 'https://synthetic.invalid', jwks_uri: configuration.jwksUrl }]) {
    const h = harness(); h.setMetadata(metadata);
    await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt, 'KEYS_UNAVAILABLE');
    assert.deepEqual(h.calls.map((row) => row.url), [configuration.metadataUrl]);
  }
});

test('JWKS: rechaza origen de issuer incorrecto, claves privadas o selección ambigua', async () => {
  const jwt = await signedToken();
  for (const keys of [[{ ...firstPublic, issuer: 'https://synthetic.invalid' }],
    [{ ...firstPublic, d: 'synthetic-private-member' }], [firstPublic, firstPublic],
    [{ kty: 'oct', kid: firstPublic.kid, k: 'synthetic' }], []]) {
    const h = harness(); h.setKeys(keys);
    await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt, 'KEYS_UNAVAILABLE');
  }
  const h = harness(); h.setKeys([{ ...firstPublic, issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0' }]);
  assert.ok(await h.validator.validateAuthorization(`Bearer ${jwt}`));
});

test('transporte usa endpoints fijos, sin redirecciones, credenciales ni contenido ilimitado', async () => {
  const jwt = await signedToken(); const normal = harness();
  await normal.validator.validateAuthorization(`Bearer ${jwt}`);
  for (const { url, init } of normal.calls) {
    assert.ok([configuration.metadataUrl, configuration.jwksUrl].includes(url));
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal('Authorization' in init.headers, false);
  }
  for (const response of [
    () => new Response(null, { status: 302, headers: { location: 'https://synthetic.invalid' } }),
    () => new Response('{bad-json', { headers: { 'content-type': 'application/json' } }),
    () => new Response('x'.repeat(1048577), { headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { headers: { 'content-type': 'text/html' } }),
  ]) {
    const h = harness({ response });
    await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt, 'KEYS_UNAVAILABLE');
  }
});

test('caché y solicitudes concurrentes comparten una descarga de metadata/JWKS', async () => {
  const h = harness(); const jwt = await signedToken();
  await Promise.all(Array.from({ length: 10 }, () => h.validator.validateAuthorization(`Bearer ${jwt}`)));
  await h.validator.validateAuthorization(`Bearer ${jwt}`);
  assert.equal(h.calls.length, 2);
});

test('rotación: unknown kid respeta cooldown, actualiza el conjunto y retira la clave anterior', async () => {
  const h = harness(); const old = await signedToken();
  await h.validator.validateAuthorization(`Bearer ${old}`);
  h.setKeys([secondPublic]);
  const rotated = await signedToken({}, { kid: secondPublic.kid }, secondKey.privateKey);
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${rotated}`), rotated, 'UNKNOWN_KEY');
  assert.equal(h.calls.length, 2);
  h.advance(30001);
  assert.ok(await h.validator.validateAuthorization(`Bearer ${rotated}`));
  assert.equal(h.calls.length, 4);
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${old}`), old, 'UNKNOWN_KEY');
  assert.equal(h.calls.length, 4);
});

test('caché caducada no permite fallback ante error de red y puede recuperarse', async () => {
  const h = harness({ cacheMaxAgeMs: 60000 }); const jwt = await signedToken();
  await h.validator.validateAuthorization(`Bearer ${jwt}`);
  h.advance(60000); h.fail();
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt, 'KEYS_UNAVAILABLE');
  const count = h.calls.length;
  await rejectsIdentity(h.validator.validateAuthorization(`Bearer ${jwt}`), jwt, 'KEYS_UNAVAILABLE');
  assert.equal(h.calls.length, count);
  h.advance(30001); h.fail(false);
  assert.ok(await h.validator.validateAuthorization(`Bearer ${jwt}`));
});

test('el proveedor por defecto falla cerrado cuando la red está bloqueada', async () => {
  const h = harness(); const jwt = await signedToken(); const initial = blockedRequests;
  const validator = createEntraIdentityValidator(configuration, { clock: h.clock });
  await rejectsIdentity(validator.validateAuthorization(`Bearer ${jwt}`), jwt, 'KEYS_UNAVAILABLE');
  assert.equal(blockedRequests, initial + 1);
});
