/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SE LE OFRECE A GOOGLE (y qué no)
 * ─────────────────────────────────────────────────────────────────────────────
 * Search Console, septiembre 2026: 347 páginas indexadas y 9.442 en «Descubierta:
 * actualmente sin indexar», con ~220 rastreos al día. Google no va a leer 10.000
 * fichas y 270.000 capítulos de un dominio nuevo: elige, y con tanta página
 * delgada elige mal y desconfía del resto. Así que elegimos nosotros.
 *
 *   A  manhwa Y novela. Lo que solo este sitio arma (brecha, equivalencia).
 *      Ficha + /equivalencia + páginas de capítulo, todo indexable.
 *   B  un solo formato, pero con sustancia (MIN_CAPITULOS o más) o con tráfico
 *      real medido en Search Console. Solo la ficha: sus capítulos, noindex.
 *   C  el resto: fichas de 1-4 capítulos y todo lo adulto. `noindex, follow` y
 *      fuera del sitemap. La página sigue funcionando para quien llega.
 *
 * Por qué no «solo A»: medido en GSC, las 9 fichas con más clics son TODAS de
 * un solo formato y suman más de la mitad del tráfico. «Solo A» lo tiraba.
 *
 * Lo adulto va a C salvo que ya traiga tráfico (entonces B). ⚠ Es un riesgo
 * aceptado a sabiendas: una ficha explícita en el índice puede bastar para que
 * AdSense rechace el dominio entero. Esas fichas no deben llevar anuncios. Lo
 * PROHIBIDO (sexualización de menores) ni siquiera se publica: ver api.ts.
 *
 * Módulo puro (solo importa la tabla de géneros): lo usan el build, el sitemap
 * y la función del edge.
 */
import { claveGenero } from './generos.ts';

export type Nivel = 'A' | 'B' | 'C';

/** Por debajo de esto una ficha de un solo formato es un título y dos enlaces. */
export const MIN_CAPITULOS = 5;

/**
 * Liberación AUTOMÁTICA de la «cola fría» (un solo formato, ≥MIN_CAPITULOS, aún
 * SIN tráfico medido) por una rampa temporal. La prioridad del dueño: que Google
 * indexe TODAS las A (manhwa + novela) primero; la cola fría entra después, sola,
 * en paquetes semanales, hasta completarse —sin tocar nada a mano—.
 *
 *   - Hasta `LOTE_INICIO`: 0 liberadas (foco en A + B-con-tráfico; A pequeño, se
 *     indexa en pocas semanas con ~220 rastreos/día).
 *   - Desde `LOTE_INICIO`: +`LOTE_POR_SEMANA` cada semana, hasta soltar todo.
 *   Las liberadas se eligen por `creada_en` (las más viejas primero) en niveles(),
 *   y una vez dentro NO salen (rampa monótona: nada de oscilar index/noindex).
 *
 * ⚠ Es por TIEMPO, no por feedback real de Google (medir la indexación necesita
 * la API de GSC en el build, que no está). Ritmo conservador para no reinundar;
 * si GSC muestra que Google va sobrado, sube LOTE_POR_SEMANA. Para pausar: pon
 * LOTE_INICIO en el futuro. Para soltar todo ya: LOTE_INICIO en el pasado + ritmo alto.
 *
 * Las A nunca pasan por aquí: una obra que gana su segundo formato —o dos fichas
 * fusionadas en una con ambos— se vuelve A sola en el siguiente build, con prioridad.
 */
export const LOTE_INICIO = '2026-11-03'; // ~4 semanas tras el deploy: deja indexar las A
export const LOTE_POR_SEMANA = 300; // 10.680 / 300 ≈ 36 semanas (~8 meses) para completar

/** Cuántas de cola fría liberar a fecha `ahora`. Pura y testable. */
export function cuantasLiberar(total: number, ahora: number = Date.now()): number {
  const semanas = (ahora - Date.parse(LOTE_INICIO)) / (7 * 24 * 60 * 60 * 1000);
  if (semanas <= 0) return 0;
  return Math.min(total, Math.floor(semanas * LOTE_POR_SEMANA));
}

/** Cola fría: un solo formato, con sustancia, pero aún sin tráfico medido. Es
 *  indexable (B) solo si entra en el lote liberado; si no, C/noindex. */
export const esColaFria = (o: { adulta: boolean; ambos: boolean; ultimo: number; conTrafico: boolean }) =>
  !o.adulta && !o.ambos && !o.conTrafico && o.ultimo >= MIN_CAPITULOS;

/** Géneros explícitos, por su clave canónica (ver generos.ts): «Adult», «adult» y
 *  «Adulto» son el mismo. `ecchi` y `mature` quedan fuera a propósito: son
 *  contenido sugerente o violento, no explícito, y son ~550 obras normales. */
const EXPLICITAS = new Set(['adulto', 'hentai', 'smut', 'erotico']);
const PROHIBIDAS = new Set(['lolicon', 'shotacon']);
/** Hay scans que no etiquetan y lo dicen en el título («… - Uncensored»). */
const TITULO_ADULTO = /\buncensored\b|\+18|\ber[oó]tic|\bhentai\b/i;

const tiene = (categorias: string[], set: Set<string>) =>
  categorias.some((c) => set.has(claveGenero(c)));

export const esProhibida = (categorias: string[]) => tiene(categorias, PROHIBIDAS);

export const esAdulta = (o: { titulo: string; categorias: string[] }) =>
  esProhibida(o.categorias) || tiene(o.categorias, EXPLICITAS) || TITULO_ADULTO.test(o.titulo);

/** Un género cuya página de categoría no debe existir (/categoria/hentai). */
export const esGeneroAdulto = (categoria: string) => tiene([categoria], EXPLICITAS) || tiene([categoria], PROHIBIDAS);

export function nivelDe(o: {
  adulta: boolean;
  ambos: boolean;
  /** Hasta qué capítulo llega su fuente más larga. */
  ultimo: number;
  /** Tuvo impresiones en Search Console (ver scripts/gsc-trafico.mjs). */
  conTrafico: boolean;
  /** Solo cola fría: si está liberada al índice en el lote actual (ver niveles()). */
  liberada?: boolean;
}): Nivel {
  // Adulta con tráfico: B (la ficha, nunca sus capítulos). Decisión del dueño,
  // sept. 2026: la obra con más clics del sitio es Adult/Smut.
  if (o.adulta) return o.conTrafico ? 'B' : 'C';
  if (o.ambos) return 'A';
  if (o.conTrafico) return 'B'; // B con tráfico: siempre dentro, nunca batcheada.
  // Cola fría: indexable solo si entra en el lote liberado (LOTE_B_FRIA); si no,
  // C/noindex hasta que el lote crezca. Prioriza que las A se indexen primero.
  if (o.ultimo >= MIN_CAPITULOS) return o.liberada ? 'B' : 'C';
  return 'C';
}
