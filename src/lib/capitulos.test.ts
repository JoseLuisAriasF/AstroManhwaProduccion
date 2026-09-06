/**
 * Check de lo que sobra del título que trajo la scan.
 * Correr con: node --experimental-strip-types src/lib/capitulos.test.ts
 */
import assert from 'node:assert/strict';
import { restoDelTitulo } from './capitulos.ts';

// Lo normal: el título ES el número, así que no queda nada que enseñar.
assert.equal(restoDelTitulo('Capítulo 1200', 1200), '');
assert.equal(restoDelTitulo('Chapter 1200', 1200), '');
assert.equal(restoDelTitulo('Cap. 1200', 1200), '');
assert.equal(restoDelTitulo('CH.1200', 1200), '');
assert.equal(restoDelTitulo('1200', 1200), '');
assert.equal(restoDelTitulo('  Capitulo 0173  ', 173), '');
assert.equal(restoDelTitulo('Bab 45', 45), '');
assert.equal(restoDelTitulo('Chương 45', 45), '');

// Un subtítulo de verdad sobrevive entero.
assert.equal(restoDelTitulo('Capítulo 1200: El regreso', 1200), 'El regreso');
assert.equal(restoDelTitulo('Chapter 12 - The End', 12), 'The End');
assert.equal(restoDelTitulo('12.5 Extra', 12.5), 'Extra');

// Otro número al frente = dato real (saga renumerada). No se toca.
assert.equal(restoDelTitulo('Temporada 2 capítulo 5', 5), 'Temporada 2 capítulo 5');
assert.equal(restoDelTitulo('Capítulo 99', 100), 'Capítulo 99');

// Sin número indexado no hay nada que comparar: se enseña tal cual.
assert.equal(restoDelTitulo('Especial de Año Nuevo', null), 'Especial de Año Nuevo');
assert.equal(restoDelTitulo('', 5), '');

console.log('OK: resto del título de capítulo');
