import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { health } from '../.local-build/http/health.js';
import { assertLocalEnvironment } from '../.local-build/infrastructure/localOnly.js';

const localSettings = {
  PAI_POC_LOCAL_ONLY: '1', AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
  AzureWebJobsStorage: 'UseDevelopmentStorage=true',
};

test('health cumple el contrato JSON sin reflejar entrada del cliente', () => {
  const request = new HttpRequest({ method: 'GET', url: 'http://127.0.0.1/api/poc/health?actor=untrusted', headers: { 'x-poc-actor': 'untrusted' } });
  const response = health(request, new InvocationContext());
  assert.equal(response.status, 200);
  assert.match(response.headers['Content-Type'], /^application\/json/);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(JSON.stringify(response.jsonBody)), {
    status: 'ok', service: 'pai-api-poc', stage: 'L1', mode: 'local-only',
  });
  assert.ok(!JSON.stringify(response).includes('untrusted'));
});

test('arranque sin habilitación local o en Production falla cerrado', () => {
  assert.throws(() => assertLocalEnvironment({}));
  assert.throws(() => assertLocalEnvironment({ PAI_POC_LOCAL_ONLY: '1', AZURE_FUNCTIONS_ENVIRONMENT: 'Production' }));
  assert.doesNotThrow(() => assertLocalEnvironment(localSettings));
  assert.doesNotThrow(() => assertLocalEnvironment({
    ...localSettings, WEBSITE_HOSTNAME: 'localhost:7071',
  }));
});

for (const marker of ['WEBSITE_INSTANCE_ID', 'WEBSITE_HOSTNAME', 'WEBSITE_SITE_NAME', 'IDENTITY_ENDPOINT', 'MSI_ENDPOINT', 'CONTAINER_APP_NAME']) {
  test(`el indicador de alojamiento ${marker} impide registrar el endpoint`, () => {
    assert.throws(() => assertLocalEnvironment({
      ...localSettings, [marker]: 'present',
    }));
  });
}
