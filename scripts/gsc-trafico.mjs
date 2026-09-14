/**
 * Las obras con tráfico real en Google → src/lib/con-trafico.json.
 *
 * Una ficha de un solo formato y pocos capítulos va a `noindex` (nivel C, ver
 * src/lib/indexacion.ts)… salvo que Google ya la esté enseñando. Esas no se
 * tocan: tirar una página que trae clics por una regla general es perder
 * tráfico por coherencia.
 *
 * Search Console → Rendimiento → 3 meses → Exportar → CSV. El zip trae
 * `Páginas.csv`; se le pasa ese archivo (o varios, de exportaciones distintas):
 *
 *   node scripts/gsc-trafico.mjs ~/Downloads/Páginas.csv
 *
 * Suma a lo que ya había, no reemplaza: una obra que tuvo impresiones hace cuatro
 * meses y hoy no sale en la exportación sigue siendo candidata a volver.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DESTINO = new URL('../src/lib/con-trafico.json', import.meta.url);
const archivos = process.argv.slice(2);
if (!archivos.length) {
  console.error('Uso: node scripts/gsc-trafico.mjs <Páginas.csv> [más.csv…]');
  process.exit(1);
}

const slugs = new Set(JSON.parse(readFileSync(DESTINO, 'utf8')));
const antes = slugs.size;
for (const archivo of archivos) {
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    // La URL es la primera columna y no lleva comas; el resto son números.
    const m = /\/novela\/([^/?#,"]+)/.exec(linea.split(',')[0]);
    if (m) slugs.add(decodeURIComponent(m[1]));
  }
}
writeFileSync(DESTINO, JSON.stringify([...slugs].sort(), null, 2) + '\n');
console.log(`${slugs.size} obras con tráfico (+${slugs.size - antes}) → src/lib/con-trafico.json`);
