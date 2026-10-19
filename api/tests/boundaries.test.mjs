import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBoundaries } from '../scripts/check-boundaries.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function scenario(run) {
  const temporary = path.join(root, '.test-tmp');
  await mkdir(temporary, { recursive: true });
  const directory = await mkdtemp(path.join(temporary, 'boundary-'));
  try {
    for (const item of ['src', 'tsconfig.json', '.funcignore']) {
      await cp(path.join(root, item), path.join(directory, item), { recursive: true });
    }
    await run(directory);
  } finally {
    // directory siempre es un hijo creado por mkdtemp dentro de api/.test-tmp.
    assert.ok(path.relative(temporary, directory).startsWith('boundary-'));
    await rm(directory, { recursive: true, force: true });
  }
}

test('la estructura actual respeta los límites L1', () => checkBoundaries());

test('agregar un fixture bajo src bloquea la compilación', () => scenario(async (directory) => {
  await mkdir(path.join(directory, 'src', 'fixtures'));
  await writeFile(path.join(directory, 'src', 'fixtures', 'actors.ts'), 'export const actors = [];');
  await assert.rejects(checkBoundaries(directory), /Fuera|fuera/);
}));

test('importar identidad local desde una fuente admitida también se rechaza', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'http', 'health.ts'), 'import "../../local/identity.js";');
  await assert.rejects(checkBoundaries(directory), /Importación fuera/);
}));

test('habilitar excepciones de publicación se rechaza', () => scenario(async (directory) => {
  await writeFile(path.join(directory, '.funcignore'), '**\n!local/identity.js\n');
  await assert.rejects(checkBoundaries(directory), /publicación/);
}));
