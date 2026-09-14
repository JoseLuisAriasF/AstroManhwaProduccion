/**
 * Correr con: node --experimental-strip-types src/lib/indexacion.test.ts
 */
import assert from 'node:assert/strict';
import { esAdulta, esGeneroAdulto, esProhibida, nivelDe } from './indexacion.ts';

const obra = { adulta: false, ambos: false, ultimo: 0, conTrafico: false };

assert.equal(nivelDe({ ...obra, ambos: true, ultimo: 1 }), 'A', 'ambos es A aunque vaya corta');
assert.equal(nivelDe({ ...obra, ultimo: 5 }), 'B', 'un formato con sustancia');
assert.equal(nivelDe({ ...obra, ultimo: 4 }), 'C', 'un formato y delgada');
assert.equal(nivelDe({ ...obra, ultimo: 1, conTrafico: true }), 'B', 'el tráfico medido la rescata');
assert.equal(nivelDe({ ...obra, adulta: true, ambos: true, ultimo: 300 }), 'C', 'lo adulto sin tráfico no se indexa');
assert.equal(nivelDe({ ...obra, adulta: true, ambos: true, conTrafico: true }), 'B', 'adulta con tráfico: solo la ficha, nunca A');

assert.ok(esAdulta({ titulo: 'Ella Me Enseña Mucho - Uncensored', categorias: [] }), 'por el título');
assert.ok(esAdulta({ titulo: 'El taller de sonidos eróticos', categorias: [] }), 'erótico con tilde');
assert.ok(esAdulta({ titulo: 'X', categorias: ['Romance', 'Hentai'] }), 'por género, sin importar mayúsculas');
assert.ok(!esAdulta({ titulo: 'Heroica', categorias: ['Ecchi', 'Mature'] }), 'ecchi/mature no son explícitos');
assert.ok(!esAdulta({ titulo: 'Theoretical Physics', categorias: [] }), '"eroti" dentro de otra palabra no cuenta');
assert.ok(esProhibida(['lolicon']) && !esProhibida(['adult']));
assert.ok(esGeneroAdulto('adult') && !esGeneroAdulto('drama'));

console.log('OK: niveles de indexación');
