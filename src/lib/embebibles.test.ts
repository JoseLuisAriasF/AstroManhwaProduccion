/**
 * Check de qué URLs se abren dentro del sitio.
 * Correr con: node --experimental-strip-types src/lib/embebibles.test.ts
 */
import assert from 'node:assert/strict';
import { esEmbebible } from './embebibles.ts';

assert.equal(esEmbebible('https://leemiau.com/estandar-capitulo-129/'), true);
assert.equal(esEmbebible('https://www.leemiau.com/x'), true, 'el www no cuenta');
assert.equal(esEmbebible('https://cdn.leemiau.com/x'), true, 'un subdominio sí');
assert.equal(esEmbebible('https://LEEMIAU.com/x'), true, 'mayúsculas');

// Los que mandan X-Frame-Options: se van a la pestaña de siempre.
assert.equal(esEmbebible('https://imperiomanhua.com/manga/x/capitulo-1/'), false);
assert.equal(esEmbebible('https://mangadex.org/chapter/abc'), false);

// Un dominio que solo TERMINA igual no es el mismo dominio. Sin el punto del
// `endsWith`, cualquiera registra "noleemiau.com" y se cuela en el marco.
assert.equal(esEmbebible('https://noleemiau.com/x'), false);
assert.equal(esEmbebible('https://leemiau.com.evil.test/x'), false);

// Una URL rota de una scan no puede tumbar el render de la lista.
assert.equal(esEmbebible('no-es-una-url'), false);
assert.equal(esEmbebible(''), false);

console.log('OK: qué fuentes se abren dentro del sitio');
