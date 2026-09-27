/**
 *   node scripts/enriquecer.test.mjs
 */
import assert from 'node:assert/strict';
import { demografiaDe, demografiaPorGeneros, generosDe, parcheDe } from './enriquecer.mjs';

assert.equal(demografiaDe(['Action', 'Shounen']), 'Shounen');
assert.equal(demografiaDe(['shonen']), 'Shounen', 'grafía sin u');
assert.equal(demografiaDe(['Shounen Ai']), null, 'Shounen Ai no es una demografía');

assert.equal(demografiaPorGeneros(['Acción', 'Fantasía']), 'Shounen');
assert.equal(demografiaPorGeneros(['Martial Arts']), 'Shounen', 'alias en inglés');
assert.equal(demografiaPorGeneros(['Romance']), 'Shoujo');
assert.equal(demografiaPorGeneros(['Romance', 'Smut']), 'Seinen', 'lo adulto manda');
assert.equal(demografiaPorGeneros(['Cocina']), null, 'sin pistas, no se inventa');

assert.deepEqual(parcheDe({ categorias: ['Romance', 'Drama'] }, null).categorias, ['Romance', 'Drama', 'Shoujo']);
assert.equal(parcheDe({ categorias: ['Seinen'] }, null).categorias, undefined, 'la que ya tiene no se toca');
assert.deepEqual(
  parcheDe(
    { titulo: 't', categorias: [], sinopsis: 'x' },
    { titulos: [], sinopsis: '', generos: ['Action'], demografia: 'Seinen' },
  ).categorias,
  ['Action', 'Seinen'],
  'la de la base de fichas gana a la deducida',
);

assert.deepEqual(
  generosDe({ generos: ['Action'], etiquetas: ['Transported to Another World', 'Male Protagonist', 'Murim'] }),
  ['Action', 'Transported to Another World', 'Murim'],
  'de los tags solo entran los que son género',
);
assert.deepEqual(
  parcheDe(
    { titulo: 't', categorias: ['Acción', 'Fantasía'], sinopsis: 'x' },
    { titulos: [], sinopsis: '', generos: ['Action', 'Isekai'], etiquetas: ['Reincarnation'] },
  ).categorias,
  ['Acción', 'Fantasía', 'Isekai', 'Reincarnation', 'Shounen'],
  'se fusionan con lo que ya tenía, sin repetir Acción/Action',
);

console.log('OK: enriquecer');
