/**
 *   node --experimental-strip-types src/lib/generos.test.ts
 */
import assert from 'node:assert/strict';
import { generosEn, nombreGenero, slugGeneroCanonico } from './generos.ts';
import { esAdulta } from './indexacion.ts';

// Lo que traen las obras A de verdad: mayúsculas, guiones bajos, dos idiomas.
assert.deepEqual(
  generosEn(['Action', 'action', 'Martial Arts', 'martial_arts', 'Artes marciales', 'Sci-fi', 'Regresión']),
  ['Acción', 'Artes marciales', 'Ciencia ficción', 'Regresión'],
  'una etiqueta por género, en español',
);
assert.deepEqual(generosEn(['Acción', 'Slice of Life'], 'en'), ['Action', 'Slice of Life'], 'y en inglés para /en/');
assert.equal(nombreGenero('Crazy MC'), 'Protagonista loco');
assert.equal(nombreGenero('Cultivo raro'), 'Cultivo raro', 'lo desconocido se queda tal cual');

assert.equal(slugGeneroCanonico('action'), 'accion');
assert.equal(slugGeneroCanonico('martial-arts'), 'artes-marciales');
assert.equal(slugGeneroCanonico('slice-of-life'), 'recuentos-de-la-vida');
assert.equal(slugGeneroCanonico('sci-fi'), 'ciencia-ficcion');
assert.equal(slugGeneroCanonico('accion'), null, 'el bueno no redirige');
assert.equal(slugGeneroCanonico('no-existe'), null);

assert.ok(esAdulta({ titulo: 'X', categorias: ['Adulto'] }), 'lo adulto se detecta también ya traducido');

console.log('OK: géneros');
