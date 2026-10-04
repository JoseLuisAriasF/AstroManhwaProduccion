/**
 *   node --experimental-strip-types src/lib/titulos.test.ts
 * Casos sacados de las obras nivel A reales (sept. 2026).
 */
import assert from 'node:assert/strict';
import { esTextoIngles, idiomaTitulo, segundoNombre, tituloIngles } from './titulos.ts';

const casos: [string, string][] = [
  ['Return of the Mount Hua Sect', 'en'],
  ['Log Into The Future', 'en'],
  ['Stop Summoning Me!', 'en'],
  ['Absolute Necromancer', 'en'],
  ['Breakers', 'en'],
  ["A Dragonslayer's Peerless Regression", 'en'],
  ['I Have a Mythical Tree', 'en'],
  ['History of Three States', 'en'],
  ['Regreso de la Secta del Monte Hua', 'es'],
  ['Cazando automáticamente con mis clones', 'es'],
  ['Ciudad del pecado', 'es'],
  ['Bie Zai Zhaohuan Wo La!', 'otro'],
  ['Qing Yu Nian', 'otro'],
  ['Jeoldae Hoegwi', 'otro'],
  ['Hwasan Jaerim', 'otro'],
  ['Madojeonsaenggi', 'otro'],
  ['화산귀환', 'otro'],
  ['Cao Võ: Hạ Cánh Đến Một Vạn Năm Sau', 'otro'],
  ['La régression parfaite', 'otro'],
  ['Forjando um Império Industrial em um Mundo Mágico', 'otro'],
  ['Die Rückkehr der Huashan-Sekte', 'otro'],
  ['Juego Mortal', 'es'],
  ['Antiguo Supremo', 'es'],
  ['De duende a Dios Goblin', 'es'],
  ['Callate dragona malvada, ya no quiero criar hijos contigo', 'es'],
  ['Maestro Marcial', 'es'],
  ['Pensé Que Tenía Fecha Límite', 'es'],
  ['Papá paladin.', 'es'],
  ['Nigromante Sin Límitesㅤ', 'es'],
  ['Nano Machine', 'en'],
  ['Obligado a ser Demonio Celestial', 'es'],
  ['Espadachin a Tiempo Completo', 'es'],
  ['A Not So Fairy Tale', 'en'],
  ['Le régresseur de la famille déchue', 'otro'],
  ['Make Heroine ga Oosugiru!', 'otro'],
  ['Origin', 'en'],
  ['Yuan Zun', 'otro'],
  ['Taejonbirok', 'otro'],
  ["Le Sens de l'épée", 'otro'],
  ['Le Bébé Tyran', 'otro'],
  ['Gobelin : Évolution Infinie', 'otro'],
  ['Issu de sang vulgaire', 'otro'],
  ['Hayalet Eş', 'otro'],
  ['SAMOTNE LEVELOWANIE: KRES BOGÓW', 'otro'],
  ['Upando Sozinho: Ragnarok', 'otro'],
  ['Sobrevivendo ao Jogo como um Bárbaro', 'otro'],
];
for (const [t, esperado] of casos) assert.equal(idiomaTitulo(t), esperado, t);

const convocar = {
  titulo: '¡Por favor, dejen de convocarme!',
  titulosAlternativos: ['Bie Zai Zhaohuan Wo La!', 'Stop Summoning Me!', '别再召唤我啦！'],
};
assert.equal(tituloIngles(convocar), 'Stop Summoning Me!', 'salta el pinyin');
assert.equal(segundoNombre(convocar, 'es'), 'Stop Summoning Me!');

const caballero = {
  titulo: 'A Knight who Eternally Regresses',
  titulosAlternativos: ['오늘만 사는 기사', 'The Knight who Only Lives for Today', 'Caballero en eterna regresión'],
};
assert.equal(tituloIngles(caballero), 'A Knight who Eternally Regresses', 'el principal ya es inglés');
assert.equal(segundoNombre(caballero, 'es'), 'Caballero en eterna regresión', 'principal inglés → el español al lado');

const zenith = {
  titulo: 'Amigo de la Infancia del Zenith',
  titulosAlternativos: ['Amigo De La Infancia Del Zenith Novela', 'Shadow of the Supreme', '천하제일인의 소꿉친구'],
};
assert.equal(segundoNombre(zenith, 'es'), 'Shadow of the Supreme', 'sin la etiqueta "Novela"');

assert.equal(segundoNombre({ titulo: 'Breakers', titulosAlternativos: ['브레이커즈'] }, 'es'), undefined, 'nada fiable, nada');

// Sinopsis: inglés de AniList sí, español de una scan no, frase corta no decide.
assert.equal(esTextoIngles('After dying at the hands of his master, the young swordsman returns to the day he joined the sect and swears to change his fate with the knowledge of his past life.'), true);
assert.equal(esTextoIngles('Después de morir a manos de su maestro, el joven espadachín regresa al día en que entró a la secta y jura cambiar su destino con lo que sabe de su vida pasada.'), false);
assert.equal(esTextoIngles('The return of the hero'), false, 'menos de 12 palabras');
console.log('OK: títulos por idioma');
