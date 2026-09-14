/**
 *   node --experimental-strip-types src/lib/sinopsis.test.ts
 * Formatos reales de MangaDex/MangaUpdates, con texto de relleno.
 */
import assert from 'node:assert/strict';
import { limpiarSinopsis, limpiarTitulo } from './sinopsis.ts';

assert.equal(
  limpiarSinopsis(
    'A knight dies and wakes up again. How far can he go?\n*(Source: WEBTOON)*\n\n**Original Novel:**\n[Naver Series](https://series.naver.com/x)\n\n**Official Translations:**\n[English](https://www.webtoons.com/en/x)',
  ),
  'A knight dies and wakes up again. How far can he go?',
  'fuente en línea aparte + bloques en negrita',
);
assert.equal(
  limpiarSinopsis('He gets a second chance! (From [LINE Webtoon](https://www.mangaupdates.com/groups.html?id=1))\n\n**Original Webtoon:**\n[Naver](https://comic.naver.com/x)'),
  'He gets a second chance!',
  'fuente con enlace markdown dentro del paréntesis',
);
assert.equal(
  limpiarSinopsis('First paragraph.\nStill the story.\n\nSecond paragraph.\n\n(Source: Tapas, edited)'),
  'First paragraph.\nStill the story.\n\nSecond paragraph.',
  'la fuente sola en su párrafo desaparece y la historia queda entera',
);
assert.equal(
  limpiarSinopsis('Note: previously titled X.\n\nThe real story starts here.\n\n---\n**Links:**\n- [Raw](https://x)'),
  'The real story starts here.',
  'una nota antes de la historia se salta; la ficha después la corta',
);
assert.equal(limpiarSinopsis('He wakes up 23 years earlier.\n\n*Source: Line Webtoon*'), 'He wakes up 23 years earlier.', 'fuente en cursiva sin paréntesis');
assert.equal(limpiarSinopsis('She must rise.\n*Source: Ink Pop*'), 'She must rise.', 'y pegada al párrafo');
assert.equal(limpiarSinopsis('Un chico descubre un poder oculto.'), 'Un chico descubre un poder oculto.', 'lo limpio no cambia');
assert.equal(limpiarSinopsis(null), '');

assert.equal(limpiarTitulo(' Iniciando sesión en 10,000 años en el futuro'), 'Iniciando sesión en 10,000 años en el futuro');
assert.equal(limpiarTitulo('Nigromante Sin Límitesㅤ'), 'Nigromante Sin Límites');

console.log('OK: sinopsis y títulos limpios');
