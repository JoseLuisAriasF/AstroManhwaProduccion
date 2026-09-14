import { getCapitulosExternos, getNovelas } from './api';
import { niveles } from './catalogo';
import { fuentesSoloEnlace } from './soloEnlace';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * El sitemap de los ~200.000 capítulos
 * ─────────────────────────────────────────────────────────────────────────────
 * Las páginas de capítulo no existen como archivo: las arma
 * `functions/novela/[slug]/[capitulo].ts` en el edge. Eso resuelve el límite de
 * 20.000 archivos de Cloudflare Pages, pero deja un problema nuevo: **una URL
 * que no cuelga de ningún enlace ni de ningún sitemap no la visita nadie.**
 *
 * Un sitemap sí cabe: es texto, no archivos. 200.000 URLs son ~15 MB repartidos
 * en cuatro o cinco XML, y el tope del formato son 50.000 URLs (o 50 MB) por
 * archivo. Se generan en el build, donde el catálogo entero ya está en memoria.
 *
 * Solo entran capítulos que EXISTEN en alguna fuente, que es exactamente lo que
 * la función del edge sirve con 200: un sitemap lleno de 404 es peor que no
 * tener sitemap.
 *
 * Y **las fuentes link-out quedan fuera**. Olympus (y las de su clase) guardan
 * UNA fila con el total en `numero` y la URL de la serie, no del capítulo:
 * `{ numero: 18, titulo: 'Serie completa · 18 capítulos', url: '/series/…' }`.
 * Tomar ese 18 por un capítulo sería inventarse una página que enlaza a un
 * índice. El filtro no es nuevo: `soloEnlace` es la misma marca con la que la
 * ficha decide enseñar «Ver serie» en vez de una lista.
 */

/** Por debajo del tope de 50.000 del formato, con margen. */
const POR_ARCHIVO = 45_000;

let cache: Promise<string[]> | null = null;

/** `/novela/<slug>/capitulo-<n>` de todo el catálogo, sin repetir número. */
function todas(): Promise<string[]> {
  cache ??= (async () => {
    const rutas: string[] = [];
    // La misma lista que publica `/fuentes-enlace.json` y lee la función del
    // edge: sitemap y función no pueden discrepar por construcción.
    const linkOut = new Set(await fuentesSoloEnlace());
    // Solo las obras A (manhwa y novela). Las demás sirven sus capítulos con
    // noindex (ver indexacion.ts): eran ~270.000 URLs casi iguales, justo el
    // patrón de «contenido a escala» que Google castiga en el dominio entero.
    const mapa = await niveles();
    for (const novela of await getNovelas()) {
      if (mapa.get(novela.slug) !== 'A') continue;
      const externos = await getCapitulosExternos(novela.slug);
      // Los números salen de la lista CRUDA, no de la de `fuentesDe`: esa viene
      // recortada a TOPE_RENDER (3.000) para no inflar el HTML de la ficha, y
      // una novela de 5.072 capítulos perdería los 2.072 primeros del sitemap.
      const numeros = new Set<number>();
      for (const c of externos) {
        if (linkOut.has(c.fuenteId)) continue;
        if (typeof c.numero === 'number' && c.numero > 0) numeros.add(c.numero);
      }
      // Ordenados de mayor a menor: los capítulos recientes son los que se
      // buscan, y en un sitemap enorme el orden es lo único que le dice al
      // rastreador por dónde empezar.
      for (const n of [...numeros].sort((a, b) => b - a)) {
        rutas.push(`/novela/${novela.slug}/capitulo-${n}`);
      }
    }
    return rutas;
  })();
  return cache;
}

/** Cuántos archivos hacen falta. 1 como mínimo (aunque no haya capítulos). */
export async function nPaginas(): Promise<number> {
  return Math.max(1, Math.ceil((await todas()).length / POR_ARCHIVO));
}

/** Las rutas del archivo `pagina` (1-indexado). */
export async function rutasDePagina(pagina: number): Promise<string[]> {
  return (await todas()).slice((pagina - 1) * POR_ARCHIVO, pagina * POR_ARCHIVO);
}
