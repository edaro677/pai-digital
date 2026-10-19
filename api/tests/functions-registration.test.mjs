import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
test('entrada y registro Functions conservan health y exponen solo las dos consultas GET', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.main, '.local-build/functions/index.js');
  const index = await readFile(new URL('src/functions/index.ts', root), 'utf8');
  assert.match(index, /import '\.\/health\.js'/);
  assert.match(index, /import '\.\/fichas\.js'/);
  const registered = [];
  for (const file of ['health.ts', 'fichas.ts']) {
    const text = await readFile(new URL(`src/functions/${file}`, root), 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function inspect(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'app.http') {
        const [name, options] = node.arguments;
        const properties = Object.fromEntries(options.properties.map(p => [p.name.getText(source), p.initializer.getText(source)]));
        registered.push([name.text, properties.route, properties.handler]);
        assert.equal(properties.methods, "['GET']");
        assert.equal(properties.authLevel, "'anonymous'");
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
    assert.match(text, /assertLocalEnvironment\(\)/);
  }
  assert.deepEqual(registered, [
    ['pocHealth', "'poc/health'", 'health'],
    ['pocFicha', "'poc/fichas/{fichaId}'", 'handlers.ficha'],
    ['pocFichaActividades', "'poc/fichas/{fichaId}/actividades'", 'handlers.actividades'],
  ]);
  const start = await readFile(new URL('scripts/start-local.mjs', root), 'utf8');
  assert.match(start, /--address 127\.0\.0\.1 --port 7071 --functions pocHealth pocFicha pocFichaActividades/);
});
