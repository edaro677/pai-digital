import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBackendDemo } from './helpers/backend-demo.mjs';

test('DEMO: complete memory journey, HTTP controls, evidence prerequisite and audit', async () => {
  const result = await runBackendDemo();
  assert.equal(result.status, 'OK', JSON.stringify(result));
  assert.equal(result.http.length, 16);
  assert.ok(result.checks.every(check => check.status === 'OK'));
  assert.equal(result.checks.find(check => check.check === 'PRECONDICION_ENVIO_SIN_EVIDENCIA_RECHAZADA').level, 'domain-precondition-only');
  assert.deepEqual(result.writes, { reports: 1, audit: 1, reservations: 1, completions: 1 });
  assert.equal(result.limitations.networkHttp, false);
  assert.equal(result.limitations.realInstitutionalLogin, false);
  assert.equal(result.limitations.sql, false);
  assert.doesNotMatch(JSON.stringify(result), /eyJ[A-Za-z0-9_-]+\.|privateKey|directoryObjectId|objectId|BEGIN .*KEY/);
});

test('DEMO: each run starts with fresh memory and produces the same projected examples', async () => {
  const first = await runBackendDemo(), second = await runBackendDemo();
  assert.equal(first.status, 'OK'); assert.equal(second.status, 'OK');
  assert.deepEqual(first, second);
});

test('DEMO CLI: explicitly memory-only even with sql-local inherited, no native/network activity', () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/demo-backend.mjs', import.meta.url))], {
    env: { ...process.env, PAI_API_PERSISTENCE: 'sql-local' }, encoding: 'utf8', windowsHide: true, shell: false, timeout: 10000,
  });
  assert.equal(child.status, 0, child.stderr + child.stdout); assert.equal(child.stderr, '');
  const result = JSON.parse(child.stdout);
  assert.equal(result.status, 'OK'); assert.equal(result.mode, 'memory-only');
  assert.deepEqual(result.safety, { nativeDriverLoads: 0, externalNetworkRequests: 0 });
});
