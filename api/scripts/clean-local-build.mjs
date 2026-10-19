import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Destino literal dentro de api; nunca recibe rutas desde argumentos ni entorno.
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.resolve(root, '.local-build');
if (path.relative(root, target) !== '.local-build') {
  throw new Error('El destino de limpieza debe permanecer dentro de api/.local-build.');
}
await rm(target, { recursive: true, force: true });
