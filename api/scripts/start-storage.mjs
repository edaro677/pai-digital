import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { localProcessEnvironment, storageArguments } from './local-process-config.mjs';

const require = createRequire(import.meta.url);
const entry = require.resolve('azurite/dist/src/azurite.js');
const child = spawn(process.execPath, [entry, ...storageArguments], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  windowsHide: true,
  env: localProcessEnvironment(),
});

child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
