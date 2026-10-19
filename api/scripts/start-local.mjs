import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localHostEnvironment } from './local-process-config.mjs';
import { assertLocalEnvironment } from '../.local-build/infrastructure/localOnly.js';

const environment = localHostEnvironment();
// Rechazar alojamiento antes de iniciar Core Tools, además del control en el worker.
assertLocalEnvironment(environment);

// Argumentos fijos. No se aceptan direcciones ni opciones desde el cliente.
const windows = process.platform === 'win32';
const args = windows
  ? ['/d', '/s', '/c', 'func.cmd start --address 127.0.0.1 --port 7071 --functions pocHealth pocFicha pocFichaActividades']
  : ['start', '--address', '127.0.0.1', '--port', '7071', '--functions', 'pocHealth', 'pocFicha', 'pocFichaActividades'];
const child = spawn(windows ? 'cmd.exe' : 'func', args, {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  windowsHide: true,
  env: environment,
});

child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
