// Standalone memory demo. No Core Tools, browser, Entra session, sockets or SQL.
import Module from 'node:module';

const originalLoad = Module._load, originalFetch = globalThis.fetch;
let nativeAttempts = 0, networkAttempts = 0;
try {
  if (process.argv.length !== 2) throw new Error();
  Module._load = function(name, ...args) {
    if (typeof name === 'string' && /(?:mssql|msnodesqlv8)/i.test(name)) {
      nativeAttempts++; throw new Error('DEMO_NATIVE_LOADING_BLOCKED');
    }
    return originalLoad.call(this, name, ...args);
  };
  globalThis.fetch = async () => { networkAttempts++; throw new Error('DEMO_NETWORK_BLOCKED'); };
  const { runBackendDemo } = await import('../tests/helpers/backend-demo.mjs');
  const result = await runBackendDemo();
  if (nativeAttempts !== 0 || networkAttempts !== 0) throw new Error();
  console.log(JSON.stringify({ ...result, safety: { nativeDriverLoads: nativeAttempts, externalNetworkRequests: networkAttempts } }, null, 2));
  process.exitCode = result.status === 'OK' ? 0 : 1;
} catch {
  console.log(JSON.stringify({ status: 'FAILED', category: 'BACKEND_DEMO_FAILED' }));
  process.exitCode = 1;
} finally { Module._load = originalLoad; globalThis.fetch = originalFetch; }
