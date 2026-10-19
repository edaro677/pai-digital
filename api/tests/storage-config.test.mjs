import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localHostEnvironment, localProcessEnvironment, storageArguments, storageDirectory } from '../scripts/local-process-config.mjs';
import { assertLocalEnvironment } from '../.local-build/infrastructure/localOnly.js';

test('el host elimina configuración de almacenamiento heredada y fija el emulador', () => {
  const inherited = {
    PATH: 'synthetic-path', AzureWebJobsStorage: 'synthetic-account-configuration',
    azurewebjobsstorage: 'synthetic-alternate-case',
    AzureWebJobsStorage__blobServiceUri: 'https://synthetic.invalid',
    ConnectionStrings__AzureWebJobsStorage: 'synthetic-connection',
    CUSTOMCONNSTR_AzureWebJobsStorage: 'synthetic-connection',
    AzureWebJobsSecretStorageSas: 'synthetic-sas', AzureWebJobsDashboard: 'synthetic-dashboard',
    AZURE_STORAGE_CONNECTION_STRING: 'synthetic-connection', AZURE_STORAGE_ACCOUNT: 'synthetic-account',
    AZURITE_ACCOUNTS: 'synthetic-accounts', AZURITE_DB: 'synthetic-database',
  };
  const env = localHostEnvironment(inherited);
  assert.equal(inherited.AzureWebJobsStorage, 'synthetic-account-configuration');
  assert.equal(env.PATH, inherited.PATH);
  assert.equal(env.AzureWebJobsStorage, 'UseDevelopmentStorage=true');
  assert.equal(Object.keys(env).filter((key) => /storage|azurite|dashboard/i.test(key)).length, 1);
  assert.doesNotThrow(() => assertLocalEnvironment(env));
  assert.deepEqual(localProcessEnvironment(inherited), { PATH: 'synthetic-path' });
});

test('el worker rechaza configuraciones remotas, mixtas o ausentes', () => {
  const env = localHostEnvironment({});
  for (const value of [undefined, '', 'synthetic-account-configuration', 'UseDevelopmentStorage=true;DevelopmentStorageProxyUri=http://synthetic.invalid']) {
    assert.throws(() => assertLocalEnvironment({ ...env, AzureWebJobsStorage: value }));
  }
  assert.throws(() => assertLocalEnvironment({ ...env, AzureWebJobsStorage__accountName: 'synthetic-account' }));
});

test('la configuración del emulador no permite alojar el host en Azure', () => {
  const env = localHostEnvironment({ WEBSITE_INSTANCE_ID: 'synthetic-instance' });
  assert.throws(() => assertLocalEnvironment(env));
  assert.throws(() => assertLocalEnvironment({ ...localHostEnvironment({}), AZURE_FUNCTIONS_ENVIRONMENT: 'Production' }));
});

test('Azurite fija los tres listeners loopback, los puertos y el directorio interno', () => {
  for (const [host, port, expected] of [['blob', 'blob', '10000'], ['queue', 'queue', '10001'], ['table', 'table', '10002']]) {
    assert.equal(storageArguments[storageArguments.indexOf(`--${host}Host`) + 1], '127.0.0.1');
    assert.equal(storageArguments[storageArguments.indexOf(`--${port}Port`) + 1], expected);
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  assert.equal(path.relative(root, storageDirectory), '.azurite');
  assert.equal(storageArguments[storageArguments.indexOf('--location') + 1], storageDirectory);
  assert.ok(!storageArguments.includes('--disableProductStyleUrl'));
});
