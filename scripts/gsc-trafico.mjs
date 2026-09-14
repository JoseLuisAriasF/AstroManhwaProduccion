/**
 * Las obras con tráfico real en Google → src/lib/con-trafico.json.
 *
 * Una ficha de un solo formato y pocos capítulos va a `noindex` (nivel C, ver
 * src/lib/indexacion.ts)… salvo que Google ya la esté enseñando. Esas no se
 * tocan: tirar una página que trae clics por una regla general es perder
 * tráfico por coherencia.
 *
 * Search Console → Rendimiento → 3 meses → Exportar → Descargar CSV. Se le pasa
 * el .zip tal cual, o el `Páginas.csv` de dentro (o varios, de exportaciones distintas):
 *
 *   npm run trafico -- "C:/Users/LinkTek/Downloads/manhwatonovel.com-Performance-on-Search-2026-09-14.zip"
 *
 * Suma a lo que ya había, no reemplaza: una obra que tuvo impresiones hace cuatro
 * meses y hoy no sale en la exportación sigue siendo candidata a volver.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DESTINO = new URL('../src/lib/con-trafico.json', import.meta.url);
const archivos = process.argv.slice(2);
if (!archivos.length) {
  console.error('Uso: npm run trafico -- <export-de-GSC.zip | Páginas.csv> [más…]');
  process.exit(1);
}

const slugs = new Set(JSON.parse(readFileSync(DESTINO, 'utf8')));
const antes = slugs.size;
// GSC descarga un .zip con `Páginas.csv` dentro. `tar` lee zip en Windows 10+
// y macOS (bsdtar), así que no hace falta descomprimir a mano ni una dependencia.
const leer = (archivo) =>
  archivo.toLowerCase().endsWith('.zip')
    ? // En Windows, el de System32: el `tar` de Git Bash es GNU y no abre zip.
      execFileSync(
        process.platform === 'win32' ? `${process.env.SystemRoot}\\System32\\tar.exe` : 'tar',
        ['-xOf', archivo, 'Páginas.csv'],
        { encoding: 'utf8', maxBuffer: 64 << 20 },
      )
    : readFileSync(archivo, 'utf8');

for (const archivo of archivos) {
  for (const linea of leer(archivo).split(/\r?\n/)) {
    // La URL es la primera columna y no lleva comas; el resto son números.
    const m = /\/novela\/([^/?#,"]+)/.exec(linea.split(',')[0]);
    if (m) slugs.add(decodeURIComponent(m[1]));
  }
}
writeFileSync(DESTINO, JSON.stringify([...slugs].sort(), null, 2) + '\n');
console.log(`${slugs.size} obras con tráfico (+${slugs.size - antes}) → src/lib/con-trafico.json`);
