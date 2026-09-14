import { formatos, fuentesDe, getCapitulosExternos, getNovelas } from './api';
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
          ambos: formatos(externos).length === 2,
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
let indiceCats: Map<string, Novela[]> | null = null;

async function porCategoria(): Promise<Map<string, Novela[]>> {
  if (!indiceCats) {
    indiceCats = new Map();
    for (const n of await catalogoOrdenado()) {
      // Una ficha normal no recomienda lo adulto (sí al revés: de lo adulto a
      // lo normal, que es sacar al lector de ahí).
      if (esAdulta(n)) continue;
      for (const c of n.categorias) {
        const bucket = indiceCats.get(c) ?? [];
        if (bucket.length < TOPE_BUCKET) bucket.push(n);
        indiceCats.set(c, bucket);
      }
    }
  }
  return indiceCats;
}

/**
 * Obras similares para la malla de enlaces internos de una ficha. Prioriza las
 * que comparten más categorías; si la obra no tiene ninguna (o son raras), se
 * completa con vecinas alfabéticas para que NINGUNA ficha quede sin enlaces de
 * salida —una ficha sin salidas es un callejón para el rastreador—.
 */
export async function relacionadasDe(novela: Novela, cuantas = 6): Promise<Novela[]> {
  const indice = await porCategoria();
  const puntos = new Map<string, { n: Novela; comunes: number }>();
  for (const c of novela.categorias) {
    for (const n of indice.get(c) ?? []) {
      if (n.slug === novela.slug) continue;
      const prev = puntos.get(n.slug);
      if (prev) prev.comunes++;
      else puntos.set(n.slug, { n, comunes: 1 });
    }
  }
  const elegidas = [...puntos.values()]
    .sort((a, b) => b.comunes - a.comunes)
    .slice(0, cuantas)
    .map((x) => x.n);

  if (elegidas.length < cuantas) {
    const todas = await catalogoOrdenado();
    const i = todas.findIndex((n) => n.slug === novela.slug);
    const vistos = new Set([novela.slug, ...elegidas.map((n) => n.slug)]);
    for (let k = 1; elegidas.length < cuantas && k <= todas.length; k++) {
      const vecina = todas[(i + k) % todas.length];
      if (vecina && !vistos.has(vecina.slug) && !esAdulta(vecina)) {
        vistos.add(vecina.slug);
        elegidas.push(vecina);
      }
    }
  }
  return elegidas;
}
