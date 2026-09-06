import { fuentesDe, getCapitulosExternos, getNovelas } from './api';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ FUENTES NO LISTAN CAPÍTULOS (y por eso no generan páginas de capítulo)
 * ─────────────────────────────────────────────────────────────────────────────
 * Olympus y su clase guardan UNA fila por obra con el TOTAL en `numero` y la
 * URL de la serie: `{ numero: 18, titulo: 'Serie completa · 18 capítulos' }`.
 * Ese 18 no es un capítulo al que enlazar. La ficha ya lo sabe —lo marca
 * `soloEnlace` y enseña «Ver serie»— y el sitemap y la función del edge tienen
 * que saberlo igual, o publican una página que enlaza a un índice.
 *
 * **Por qué un archivo y no una consulta.** La función del edge no puede
 * recalcular la regla: son «cuántas filas tiene esta fuente para esta obra», y
 * contarlas por petición es caro. El primer intento usó `fuentes.n_caps`, que
 * parecía la misma señal y no lo es: `n_caps` es lo que encontró el ÚLTIMO
 * scrapeo, no lo que hay guardado. Medido: 3.710 fuentes tienen `n_caps <= 1`
 * y sí listan capítulos, y con esa regla **14.638 URLs del sitemap devolvían
 * 404**.
 *
 * Así que la regla se calcula UNA vez, en el build y con el mismo código que la
 * ficha, y se publica como archivo. El sitemap y la función leen el mismo: no
 * pueden discrepar por construcción. Es el patrón de `/portadas.json`.
 */
let cache: Promise<string[]> | null = null;

export function fuentesSoloEnlace(): Promise<string[]> {
  cache ??= (async () => {
    const ids: string[] = [];
    for (const novela of await getNovelas()) {
      for (const f of fuentesDe(await getCapitulosExternos(novela.slug))) {
        if (f.soloEnlace) ids.push(f.fuenteId);
      }
    }
    return ids;
  })();
  return cache;
}
