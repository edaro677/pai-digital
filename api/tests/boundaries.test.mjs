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

test('la estructura actual respeta los límites L1-L5', () => checkBoundaries());

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

test('el dominio no puede importar HTTP aunque el archivo exista en el alcance', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'domain', 'entities.ts'), 'import "../http/health.js";');
  await assert.rejects(checkBoundaries(directory), /infraestructura prohibida/);
}));

test('los contratos no pueden importar Azure Functions ni siquiera como tipo', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'application', 'ports', 'clock.ts'), 'import type { HttpRequest } from "@azure/functions";');
  await assert.rejects(checkBoundaries(directory), /infraestructura prohibida/);
}));

test('el adaptador no puede incorporar escritura de archivos', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'infrastructure', 'memory', 'unitOfWork.ts'), 'import { writeFile } from "node:fs/promises";');
  await assert.rejects(checkBoundaries(directory), /Módulo Node fuera/);
}));

test('el diagnóstico HTTP no puede activar el repositorio en memoria', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'http', 'health.ts'), 'import "../infrastructure/memory/unitOfWork.js";');
  await assert.rejects(checkBoundaries(directory), /no debe activar el adaptador/);
}));

test('el adaptador no puede importar fixtures de pruebas', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'infrastructure', 'memory', 'unitOfWork.ts'), 'import "../../../tests/fixtures/memory.mjs";');
  await assert.rejects(checkBoundaries(directory), /Importación fuera/);
}));

test('el endpoint de diagnóstico no puede activar autenticación L4-A', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'http', 'health.ts'), 'import "../infrastructure/identity/validator.js";');
  await assert.rejects(checkBoundaries(directory), /no debe conectarse a HTTP/);
}));

test('identidad no puede consultar el adaptador de memoria', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'infrastructure', 'identity', 'validator.ts'), 'import "../memory/unitOfWork.js";');
  await assert.rejects(checkBoundaries(directory), /no debe activar el adaptador/);
}));

test('jose no puede incorporarse al dominio', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'domain', 'types.ts'), 'import { jwtVerify } from "jose";');
  await assert.rejects(checkBoundaries(directory), /solo está permitido/);
}));

test('el diagnóstico HTTP no puede activar autorización L4-B', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'http', 'health.ts'), 'import "../application/authorization/service.js";');
  await assert.rejects(checkBoundaries(directory), /autorización L4-B no debe conectarse/);
}));

test('la autorización no puede acceder directamente a memoria', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'application', 'authorization', 'service.ts'), 'import "../../infrastructure/memory/unitOfWork.js";');
  await assert.rejects(checkBoundaries(directory), /infraestructura prohibida/);
}));

test('los puertos L2 no pueden depender de la autorización', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'application', 'ports', 'clock.ts'), 'import "../authorization/service.js";');
  await assert.rejects(checkBoundaries(directory), /puertos no deben depender/);
}));

test('el controlador L5 no puede importar memoria directamente', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'http', 'fichas.ts'), 'import "../infrastructure/memory/unitOfWork.js";');
  await assert.rejects(checkBoundaries(directory), /no debe activar el adaptador/);
}));
test('el controlador L5 no puede importar validación concreta ni claves', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'http', 'fichas.ts'), 'import "../infrastructure/identity/validator.js";');
  await assert.rejects(checkBoundaries(directory), /no debe conectarse a HTTP/);
}));
test('health no puede activar las consultas ni la composición L5', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'http', 'health.ts'), 'import "../composition/queries.js";');
  await assert.rejects(checkBoundaries(directory), /composición L5 solo/);
}));
test('las consultas de aplicación no pueden depender de Azure Functions', () => scenario(async (directory) => {
  await writeFile(path.join(directory, 'src', 'application', 'queries', 'readFicha.ts'), 'import type { HttpRequest } from "@azure/functions";');
  await assert.rejects(checkBoundaries(directory), /infraestructura prohibida/);
}));
