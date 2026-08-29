import type { CapituloExterno } from '@/types/novela';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA BRECHA: cuánto le lleva la novela al manhwa
 * ─────────────────────────────────────────────────────────────────────────────
 * Es el único número que este sitio tiene y los demás no, y es la razón por la
 * que alguien llega: el manhwa va por el 173, la novela por el 1948, y quien
 * acaba de terminar el manhwa quiere saber exactamente eso.
 *
 * Vive aparte porque lo piden tres sitios —el <title> de la ficha, la página de
 * equivalencia y los rankings— y calcularlo tres veces distintas terminaría con
 * tres números que no coinciden.
 *
 * Las fuentes "link-out" (Olympus) guardan el TOTAL de capítulos en `numero` en
 * vez de una lista. Para "por dónde va" el total y el último son la misma cosa,
 * así que el máximo funciona para las dos formas.
 */
export interface Brecha {
  /** Último capítulo publicado del manhwa. 0 si no hay manhwa indexado. */
  manhwa: number;
  /** Último capítulo publicado de la novela. 0 si no hay novela indexada. */
  novela: number;
  /** Capítulos de novela por delante del manhwa. Nunca negativo. */
  faltan: number;
}

const ultimoDe = (externos: CapituloExterno[], tipo: 'manhwa' | 'novela') => {
  let max = 0;
  for (const c of externos) {
    if (c.tipo === tipo && typeof c.numero === 'number' && c.numero > max) max = c.numero;
  }
  return max;
};

/**
 * `null` cuando la obra no tiene los dos formatos indexados: sin manhwa y sin
 * novela no hay brecha que contar, y prometer una comparación que no existe es
 * peor que no enseñar nada.
 */
export function brechaDe(externos: CapituloExterno[]): Brecha | null {
  const manhwa = ultimoDe(externos, 'manhwa');
  const novela = ultimoDe(externos, 'novela');
  if (!manhwa || !novela) return null;
  return { manhwa, novela, faltan: Math.max(0, novela - manhwa) };
}
