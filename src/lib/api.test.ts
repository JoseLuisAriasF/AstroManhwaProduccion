/**
 * Check mínimo de la conversión manhwa -> novela (la única lógica no trivial).
 * Correr con: node --experimental-strip-types src/lib/api.test.ts
 */
import assert from 'node:assert/strict';
import { manhwaANovela } from './equivalencia.ts';

const anclas = [
  { capituloManhwa: 1, capituloNovela: 1 },
  { capituloManhwa: 20, capituloNovela: 28 },
  { capituloManhwa: 86, capituloNovela: 123 },
];

assert.equal(manhwaANovela(anclas, 86), 123, 'ancla exacta');
assert.equal(manhwaANovela(anclas, 1), 1, 'primera ancla');
assert.equal(manhwaANovela(anclas, 53), Math.round(28 + 0.5 * 95), 'punto medio interpolado');
assert.ok(manhwaANovela(anclas, 100)! > 123, 'extrapola hacia adelante');
assert.equal(manhwaANovela(anclas, 0), null, 'capítulo inválido');
assert.equal(manhwaANovela([], 5), null, 'sin anclas');
assert.equal(manhwaANovela([{ capituloManhwa: 3, capituloNovela: 9 }], 99), 9, 'una sola ancla');

console.log('OK: equivalencia manhwa -> novela');
