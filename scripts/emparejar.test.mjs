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

// Parecido: la traducción de máquina frente a la ficha, sin clave común.
const asesinos = new IndiceObras();
asesinos.registrar('clan-asesinos', ['El hijo menor del clan de asesinos regresa con los poderes de cinco reyes demonio']);
asesinos.registrar('otra', ['El hijo menor del clan de espadachines regresa']);
const tradu = 'El hijo menor del clan Asesino regresa con el poder de los cinco reyes demonios';
assert.equal(asesinos.buscar([tradu]), null, 'exacto no casa');
assert.equal(asesinos.parecido([tradu])?.slug, 'clan-asesinos', 'por parecido sí');
assert.equal(asesinos.parecido(['El hijo menor del clan de magos regresa']), null, 'una palabra de 4 cambia la obra');
// El falso positivo visto con mgeko: una palabra de más es otra obra.
const villana = new IndiceObras();
villana.registrar('seisia', ["Don't Look for the Villainess Who Left"]);
assert.equal(villana.parecido(["Don't Look for the Resurrected Villainess"], 0.9), null, 'el apóstrofo no infla el parecido');
// "es" no cuenta: sin él quedan 3 palabras y no hay parecido que valga.
const septimo = new IndiceObras();
septimo.registrar('septimo', ['El séptimo héroe es el rey demonio']);
assert.equal(septimo.parecido(['El Rey Demonio es un héroe'], 0.8), null, 'otra obra');
// Títulos cortos: nunca por parecido.
const cortos = new IndiceObras();
cortos.registrar('mago-infinito', ['Mago infinito']);
assert.equal(cortos.parecido(['Mago infinita']), null);
// Empate entre dos obras distintas: no se elige.
const empate = new IndiceObras();
empate.registrar('a', ['uno dos tres cuatro cinco']);
empate.registrar('b', ['uno dos tres cuatro seis']);
assert.equal(empate.parecido(['uno dos tres cuatro cinco seis'], 0.6), null, 'empate, ninguna');

console.log('ok');
