import { fuentesDe, getCapitulosExternos, getNovelas } from './api';
import { brechaDe } from './brecha';
import { esAdulta, nivelDe, type Nivel } from './indexacion';
import conTrafico from './con-trafico.json';
import type { Novela } from '@/types/novela';

/**
 * El nivel de indexación de cada obra (ver `indexacion.ts`), UNA vez por build.
 * Lo leen la ficha (noindex), el sitemap de obras, el de capítulos y
 * `/obras-nivel-a.json` para la función del edge: todos del mismo mapa, así que
 * no pueden discrepar —una URL en el sitemap con noindex es un error en GSC—.
 */
let nivelesCache: Promise<Map<string, Nivel>> | null = null;
const trafico = new Set<string>(conTrafico);

export function niveles(): Promise<Map<string, Nivel>> {
  nivelesCache ??= (async () => {
    const mapa = new Map<string, Nivel>();
    for (const n of await getNovelas()) {
      const externos = await getCapitulosExternos(n.slug);
      mapa.set(
        n.slug,
        nivelDe({
          adulta: esAdulta(n),
          // Igual que el getStaticPaths de /equivalencia: el sitemap mete esa
          // URL para las A, así que "ambos" tiene que significar que existe.
          ambos: brechaDe(externos) !== null,
          ultimo: Math.max(0, ...fuentesDe(externos).map((f) => f.total)),
          conTrafico: trafico.has(n.slug),
        }),
      );
    }
    const cuenta = { A: 0, B: 0, C: 0 };
    for (const v of mapa.values()) cuenta[v]++;
    console.log(`[niveles] A=${cuenta.A} B=${cuenta.B} C=${cuenta.C} (con tráfico: ${trafico.size})`);
    return mapa;
  })();
  return nivelesCache;
}

/**
 * Orden y tamaño del catálogo paginado (/novelas/2, /novelas/3…).
 *
 * Vive aparte porque lo comparten la página de catálogo y la paginada, y ambas
 * TIENEN que estar de acuerdo: si el orden difiere entre ellas, una obra puede
 * caer en dos páginas o en ninguna, y las que quedan fuera vuelven a ser
 * huérfanas —justo lo que esta paginación existe para evitar—.
 */
export const POR_PAGINA = 96;

export const totalPaginas = (n: number) => Math.max(1, Math.ceil(n / POR_PAGINA));

/** Todo el catálogo en orden alfabético estable (mismo criterio en toda la app). */
export async function catalogoOrdenado(): Promise<Novela[]> {
  const novelas = await getNovelas();
  return [...novelas].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
}

/**
 * Índice categoría → obras, UNA vez por build. Sin él, calcular las obras
 * similares recorría el catálogo entero por cada ficha: 6.500 × 6.500 son ~42
 * millones de comparaciones y el build de Cloudflare no tiene ese margen.
 *
 * Cada categoría guarda como mucho TOPE_BUCKET obras: para sugerir 6 similares
 * no hace falta ordenar las 3.000 de "Acción".
 */
const TOPE_BUCKET = 40;
let indiceCats: Promise<Map<string, Novela[]>> | null = null;

/** Obras con manhwa Y novela: las que reciben la prioridad en el enlazado. */
const esA = async (slug: string) => (await niveles()).get(slug) === 'A';

function porCategoria(): Promise<Map<string, Novela[]>> {
  indiceCats ??= (async () => {
    const indice = new Map<string, Novela[]>();
    const orden = await catalogoOrdenado();
    const nivel = await niveles();
    // Las A entran primero en cada bucket: así casi todo el cupo de 40 son obras
    // con manhwa y novela, y las fichas de un solo formato —que traen el ~90%
    // del tráfico de Google— reparten su autoridad hacia ellas.
    const a = orden.filter((n) => nivel.get(n.slug) === 'A');
    const resto = orden.filter((n) => nivel.get(n.slug) !== 'A');
    for (const n of [...a, ...resto]) {
      // Una ficha normal no recomienda lo adulto (sí al revés: de lo adulto a
      // lo normal, que es sacar al lector de ahí).
      if (esAdulta(n)) continue;
      for (const c of n.categorias) {
        const bucket = indice.get(c) ?? [];
        if (bucket.length < TOPE_BUCKET) bucket.push(n);
        indice.set(c, bucket);
      }
    }
    return indice;
  })();
  return indiceCats;
}

/**
 * Obras similares para la malla de enlaces internos de una ficha. Primero las
 * que tienen manhwa Y novela (nivel A), y dentro de cada grupo las que comparten
 * más categorías; si la obra no tiene ninguna (o son raras), se completa con
 * vecinas alfabéticas para que NINGUNA ficha quede sin enlaces de salida —una
 * ficha sin salidas es un callejón para el rastreador—.
 */
export async function relacionadasDe(novela: Novela, cuantas = 6): Promise<Novela[]> {
  const indice = await porCategoria();
  const puntos = new Map<string, { n: Novela; comunes: number; a: boolean }>();
  for (const c of novela.categorias) {
    for (const n of indice.get(c) ?? []) {
      if (n.slug === novela.slug) continue;
      const prev = puntos.get(n.slug);
      if (prev) prev.comunes++;
      else puntos.set(n.slug, { n, comunes: 1, a: await esA(n.slug) });
    }
  }
  const elegidas = [...puntos.values()]
    .sort((x, y) => Number(y.a) - Number(x.a) || y.comunes - x.comunes)
    .slice(0, cuantas)
    .map((x) => x.n);

  if (elegidas.length < cuantas) {
    const todas = await catalogoOrdenado();
    const i = todas.findIndex((n) => n.slug === novela.slug);
    const vistos = new Set([novela.slug, ...elegidas.map((n) => n.slug)]);
    // Dos vueltas: primero las vecinas A (manhwa + novela), luego cualquiera.
    // Las fichas sin géneros son justo las de más tráfico, así que esta es la
    // vía por la que más autoridad llega a las A.
    for (const soloA of [true, false]) {
      for (let k = 1; elegidas.length < cuantas && k <= todas.length; k++) {
        const vecina = todas[(i + k) % todas.length];
        if (vecina && !vistos.has(vecina.slug) && !esAdulta(vecina) && (!soloA || (await esA(vecina.slug)))) {
          vistos.add(vecina.slug);
          elegidas.push(vecina);
        }
      }
    }
  }
  return elegidas;
}
