import cache from './traducciones.json';
import { IDIOMA_BASE, type Idioma } from './i18n';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TRADUCCIÓN EN TIEMPO DE BUILD
 * ─────────────────────────────────────────────────────────────────────────────
 * La base de datos guarda UN idioma (el base). Las demás versiones no son
 * columnas ni filas: son un caché de archivo que `npm run traducir` rellena
 * antes de compilar, y que Astro convierte en HTML estático por idioma.
 *
 *   Supabase (1 idioma) → npm run traducir → traducciones.json → HTML /en/ /pt/…
 *
 * Ventajas frente a traducir en el navegador:
 *   · Googlebot lo ve → rankeas en cada idioma → tráfico y ads por país.
 *   · Se traduce UNA vez por texto, no una vez por visita. Coste ~0 a escala.
 *
 * Ventajas frente a guardar traducciones en la BD:
 *   · La BD no engorda ni se desincroniza: hay una sola fuente de verdad.
 *   · Regenerar un idioma es borrar su clave del caché y volver a correr.
 *
 * El caché va por hash del texto ORIGEN: si corriges una frase en español, esa
 * frase cambia de hash, se retraduce sola y el resto no se toca ni se re-paga.
 */

type Cache = Record<string, Partial<Record<string, string>>>;

/** FNV-1a de 32 bits en base36. Corto, estable y sin dependencias. */
export function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Devuelve la traducción cacheada, o el texto original si aún no existe.
 *
 * También consulta el caché para el idioma BASE, y eso no es un detalle: buena
 * parte de las sinopsis las rellena `enriquecer.mjs` desde AniList/MangaBaka, y
 * vienen EN INGLÉS. Con el atajo anterior ("si es el idioma base, devuelve tal
 * cual"), la web en español enseñaba título en español y sinopsis en inglés.
 * Ahora, si el caché tiene la versión española de un texto inglés, se usa; si no
 * la hay, cae al original y no rompe nada.
 */
export function traducir(texto: string, idioma: Idioma): string {
  return (cache as Cache)[hash(texto)]?.[idioma] ?? texto;
}

/**
 * Traduce párrafo a párrafo. El caché queda con granularidad fina: corregir un
 * párrafo no invalida el capítulo entero, y los párrafos repetidos se traducen
 * una sola vez para todo el sitio.
 */
export function traducirTexto(texto: string, idioma: Idioma): string {
  // Sin atajo para el idioma base: ver el comentario de `traducir()`. Las
  // sinopsis en inglés necesitan su versión española como cualquier otra.
  return texto
    .split('\n\n')
    .map((p) => traducir(p, idioma))
    .join('\n\n');
}

/** Qué porcentaje de estos textos ya está traducido. Lo usa el script. */
export function cobertura(textos: string[], idioma: Idioma): number {
  if (idioma === IDIOMA_BASE || textos.length === 0) return 1;
  const hechos = textos.filter((t) => (cache as Cache)[hash(t)]?.[idioma]).length;
  return hechos / textos.length;
}
