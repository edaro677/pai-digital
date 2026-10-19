import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const allowedSources = new Set([
  'functions/health.ts', 'http/health.ts', 'infrastructure/localOnly.ts',
  'domain/types.ts', 'domain/entities.ts', 'domain/errors.ts',
  'application/ports/repositories.ts', 'application/ports/unitOfWork.ts', 'application/ports/clock.ts',
  'infrastructure/memory/state.ts', 'infrastructure/memory/session.ts',
  'infrastructure/memory/repositories.ts', 'infrastructure/memory/unitOfWork.ts',
  'application/ports/identity.ts',
  'application/authorization/service.ts',
  'infrastructure/identity/config.ts', 'infrastructure/identity/errors.ts',
  'infrastructure/identity/bearer.ts', 'infrastructure/identity/keys.ts',
  'infrastructure/identity/normalize.ts', 'infrastructure/identity/validator.ts',
]);

export async function checkBoundaries(root = apiRoot) {
  const sourceRoot = path.join(root, 'src');
  const config = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
  if (config.compilerOptions.rootDir !== 'src' || config.compilerOptions.outDir !== '.local-build'
      || JSON.stringify(config.include) !== JSON.stringify(['src/**/*.ts'])) {
    throw new Error('La compilación local debe quedar limitada a src y .local-build.');
  }
  const ignore = await readFile(path.join(root, '.funcignore'), 'utf8');
  if (!ignore.split(/\r?\n/).includes('**') || /^!/m.test(ignore)) {
    throw new Error('La PoC local debe excluir todos los archivos de publicación.');
  }

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('La PoC local no admite enlaces en src.');
      if (entry.isDirectory()) { await visit(absolute); continue; }
      const relative = path.relative(sourceRoot, absolute).split(path.sep).join('/');
      if (entry.name === '.gitkeep') continue;
      if (!allowedSources.has(relative)) {
        throw new Error(`Fuente fuera del alcance L1-L4B: ${relative}. Requiere revisión explícita.`);
      }
      const source = ts.createSourceFile(absolute, await readFile(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
      function inspect(node) {
        if (ts.isCallExpression(node)
            && (node.expression.kind === ts.SyntaxKind.ImportKeyword
                || (ts.isIdentifier(node.expression) && ['require', 'eval', 'Function'].includes(node.expression.text)))) {
          throw new Error(`Carga dinámica no permitida en la PoC: ${relative}`);
        }
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          const specifier = node.moduleSpecifier;
          if (specifier) {
            if (!ts.isStringLiteral(specifier)) throw new Error('Importación no estática.');
            const name = specifier.text;
            const core = relative.startsWith('domain/') || relative.startsWith('application/');
            const memory = relative.startsWith('infrastructure/memory/');
            const identity = relative.startsWith('infrastructure/identity/');
            if ((core || memory || identity) && name === '@azure/functions') {
              throw new Error(`Dependencia de infraestructura prohibida en el núcleo: ${relative}`);
            }
            if (name.startsWith('node:')) {
              if (relative !== 'infrastructure/memory/unitOfWork.ts' || !['node:crypto', 'node:async_hooks'].includes(name)) {
                throw new Error(`Módulo Node fuera del alcance: ${name}`);
              }
            } else if (name === 'jose') {
              if (!identity) throw new Error('jose solo está permitido dentro del adaptador de identidad.');
            } else if (name !== '@azure/functions') {
              const target = path.relative(sourceRoot, path.resolve(directory, name)).split(path.sep).join('/').replace(/\.js$/, '.ts');
              if (!name.startsWith('.') || !allowedSources.has(target)) {
                throw new Error(`Importación fuera del alcance L1-L4B: ${name}`);
              }
              if ((relative.startsWith('domain/') && !target.startsWith('domain/'))
                  || (relative.startsWith('application/') && !target.startsWith('domain/') && !target.startsWith('application/ports/') && !target.startsWith('application/authorization/'))) {
                throw new Error(`Dependencia de infraestructura prohibida en el núcleo: ${relative}`);
              }
              if (!relative.startsWith('application/') && target.startsWith('application/authorization/')) {
                throw new Error('La autorización L4-B no debe conectarse a HTTP ni a adaptadores.');
              }
              if (relative.startsWith('application/ports/') && target.startsWith('application/authorization/')) {
                throw new Error('Los puertos no deben depender del servicio de autorización.');
              }
              if (memory && !target.startsWith('domain/') && !target.startsWith('application/ports/') && !target.startsWith('infrastructure/memory/')) {
                throw new Error(`Adaptador de memoria acoplado a ejecución HTTP: ${relative}`);
              }
              if (!memory && !core && target.startsWith('infrastructure/memory/')) {
                throw new Error('El diagnóstico HTTP L1 no debe activar el adaptador L3.');
              }
              if (identity && !target.startsWith('domain/') && !target.startsWith('application/ports/') && !target.startsWith('infrastructure/identity/')) {
                throw new Error('El validador debe mantenerse separado de HTTP y persistencia.');
              }
              if (!identity && !core && target.startsWith('infrastructure/identity/')) {
                throw new Error('La identidad L4-A no debe conectarse a HTTP ni a persistencia.');
              }
            }
          }
        }
        ts.forEachChild(node, inspect);
      }
      inspect(source);
    }
  }
  await visit(sourceRoot);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkBoundaries();
  console.log('Límites L1-L4B verificados: identidad, autorización y persistencia separadas, sin integración HTTP ni publicación.');
}
