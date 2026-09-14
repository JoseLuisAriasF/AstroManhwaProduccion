/**
 *   node --experimental-strip-types src/lib/i18n.test.ts
 */
import assert from 'node:assert/strict';
import { ruta } from './i18n.ts';

assert.equal(ruta('es'), '/');
assert.equal(ruta('en'), '/en/');
assert.equal(ruta('es', '/novelas'), '/novelas/', 'página estática: con barra, sin 308');
assert.equal(ruta('en', '/novela/x'), '/en/novela/x/');
assert.equal(ruta('es', '/novela/x/'), '/novela/x/', 'no duplica la barra');
assert.equal(ruta('es', '/novela/x/capitulo-12'), '/novela/x/capitulo-12', 'el capítulo del edge va sin barra');
assert.equal(ruta('es', '/rss.xml'), '/rss.xml', 'un archivo va sin barra');

console.log('OK: rutas');
