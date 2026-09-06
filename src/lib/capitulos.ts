/**
 * ─────────────────────────────────────────────────────────────────────────────
 * El texto de una fila de capítulo
 * ─────────────────────────────────────────────────────────────────────────────
 * La lista pintaba el número a secas ("1200") y al lado el título que trajo la
 * scan. Pero ese título ES casi siempre el número otra vez —"Capítulo 1200",
 * "Chapter 1200", "Cap 1200"—, cada scan con su forma. Dos problemas a la vez:
 *
 *  - en pantalla se lee "1200 · Capítulo 1200";
 *  - y la página nunca contiene la frase con la que se busca un capítulo suelto
 *    ("<obra> capítulo 1200"), porque la etiqueta la pone la scan y no siempre
 *    en el idioma del sitio.
 *
 * Así que la etiqueta la escribe el sitio (`dic.capNumero`) y de lo que trajo la
 * scan se queda solo lo que AÑADE: el subtítulo de verdad, cuando lo hay.
 */

/** Prefijo de capítulo en las formas que usan las scans, + el número. */
const PREFIJO =
  /^\s*(?:cap[íi]tulo|cap[íi]tol|cap\.?|chapter|chap\.?|ch\.?|episodio|episode|ep\.?|bab|chương|kapitel|chapitre|#)?\s*[-–—:.]?\s*0*(\d+(?:[.,]\d+)?)\s*[-–—:·.|]?\s*/i;

/**
 * Lo que el título de la scan aporta por encima de "Capítulo N", o cadena vacía.
 *
 * `numero` es el que ya indexamos: si el título empieza por OTRO número (una
 * saga renumerada, "2ª temporada 5"), no se recorta nada — quitarlo escondería
 * un dato real.
 */
export function restoDelTitulo(titulo: string, numero: number | null): string {
  const t = (titulo ?? '').trim();
  if (numero === null) return t;
  const m = PREFIJO.exec(t);
  if (!m || Number(m[1].replace(',', '.')) !== numero) return t;
  return t.slice(m[0].length).trim();
}
