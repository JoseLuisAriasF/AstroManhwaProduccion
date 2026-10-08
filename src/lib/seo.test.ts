import assert from 'node:assert/strict';
import { tipoSerie, tituloFicha } from './seo.ts';

// Un solo mapa de tipo: manhwa+novela = CreativeWorkSeries; solo novela = BookSeries; resto = ComicSeries.
assert.equal(tipoSerie(['manhwa', 'novela']), 'CreativeWorkSeries');
assert.equal(tipoSerie(['novela']), 'BookSeries');
assert.equal(tipoSerie(['manhwa']), 'ComicSeries');
assert.equal(tipoSerie([]), 'ComicSeries');

// Título corto: se conserva el nombre alterno.
assert.equal(tituloFicha('Jefe', 'Boss', 'manhwa cap. 79'), 'Jefe / Boss — manhwa cap. 79');
// Título largo: se quita el alterno antes de cortar a media palabra.
assert.equal(
  tituloFicha('Regreso de la Secta del Monte Hua', 'Return of the Mount Hua Sect Extraordinary', 'manhwa cap. 79'),
  'Regreso de la Secta del Monte Hua — manhwa cap. 79',
);
// Sin alterno ni sufijo: el nombre principal, sin duplicar si el alterno es igual.
assert.equal(tituloFicha('Solo', 'Solo', ''), 'Solo');
console.log('seo.test: ok');
