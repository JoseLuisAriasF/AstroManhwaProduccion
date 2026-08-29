/**
 * Check del emparejado: la misma obra desde nombres distintos cae en un slug.
 *   node scripts/emparejar.test.mjs
 */
import assert from 'node:assert/strict';
import { IndiceObras, normalizar } from './emparejar.mjs';

// Normalización: acentos, mayúsculas, puntuación, espacios.
assert.equal(normalizar('  Regreso de la Secta del Monte Huá! '), 'regreso de la secta del monte hua');
assert.equal(normalizar('Return of the Mount Hua Sect'), 'return of the mount hua sect');
assert.equal(normalizar('화산귀환'), '화산귀환'); // CJK se conserva como texto

const idx = new IndiceObras();
// La obra existe en MangaDex con sus nombres en varios idiomas.
idx.registrar('return-of-the-mount-hua', [
  'Return of the Mount Hua Sect',
  'Regreso de la Secta del Monte Hua',
  '화산귀환',
  'RotMH',
]);

// Una scan la trae solo con el título en español, con acento y signos.
assert.equal(
  idx.buscar(['¡Regreso de la Secta del Monte Huá!']),
  'return-of-the-mount-hua',
  'empareja por el título en español',
);
// Otra fuente, con el nombre coreano.
assert.equal(idx.buscar(['화산귀환']), 'return-of-the-mount-hua', 'empareja por el nombre coreano');
// Una obra sin relación no empareja.
assert.equal(idx.buscar(['Solo Leveling']), null);
// Artículo inicial que una fuente añade y otra no: deben emparejar igual.
assert.equal(
  idx.buscar(['El Regreso de la Secta del Monte Hua']),
  'return-of-the-mount-hua',
  'ignora el "El" inicial',
);
const conArt = new IndiceObras();
conArt.registrar('x', ['La Villana Rica']);
assert.equal(conArt.buscar(['Villana Rica']), 'x', 'empareja sin el artículo');

// Dos manos traduciendo el mismo título coreano lo ordenan distinto: Olympus
// publica "El Lancero Genio Inmortal" y las fichas guardan "El genio lancero
// inmortal". Mismas palabras → misma obra (y por ahí engancha su novela en
// inglés, que es lo que estaba quedándose en una ficha aparte).
const orden = new IndiceObras();
orden.registrar('lancero-inmortal', ['El genio lancero inmortal', 'The Immortal Genius Spearman']);
assert.equal(
  orden.buscar(['El Lancero Genio Inmortal']),
  'lancero-inmortal',
  'empareja con las palabras en otro orden',
);
assert.equal(orden.buscar(['The Immortal Genius Spearman']), 'lancero-inmortal');

// Con dos palabras el orden SÍ distingue obras: ahí no se reordena nada.
const dosPalabras = new IndiceObras();
dosPalabras.registrar('rey-demonio', ['Rey Demonio']);
assert.equal(dosPalabras.buscar(['Demonio Rey']), null, 'con 2 palabras el orden manda');

// Nombres muy cortos no indexan: evitan choques absurdos.
const corto = new IndiceObras();
corto.registrar('obra-a', ['Go']);
assert.equal(corto.buscar(['Go']), null, 'nombres de <3 chars se ignoran');

// El primer slug en reclamar un nombre lo conserva (determinista).
const dup = new IndiceObras();
dup.registrar('primera', ['Tower of God']);
dup.registrar('segunda', ['Tower of God']);
assert.equal(dup.buscar(['tower of god']), 'primera');

console.log('ok');
