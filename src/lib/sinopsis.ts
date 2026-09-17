/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SINOPSIS, SIN LA FICHA TÉCNICA
 * ─────────────────────────────────────────────────────────────────────────────
 * Las sinopsis de MangaDex y MangaUpdates traen pegado todo lo que no es la
 * historia: «(Source: WEBTOON)», «**Original Webtoon:** [Naver](https://…)»,
 * «**Official Translations:** [English](…), [Thai](…)», «Note: …». Medido en
 * septiembre de 2026: 187 de las 251 obras A.
 *
 * En la ficha es ruido, y traducido es peor: NLLB no sabe qué hacer con una
 * lista de enlaces y la «traduce» inventando URLs que se repiten cientos de
 * veces. Así que se limpia ANTES de pintar y ANTES de traducir. Las dos cosas
 * pasan por aquí: `api.ts` (lo que se ve) y `scripts/traducir.mjs` (la clave del
 * caché de traducciones es el hash del texto limpio).
 *
 * Módulo puro.
 */

/** Un párrafo que abre la ficha técnica: de ahí para abajo ya no es la historia. */
const FICHA = /^(?:\*?\s*(?:source|fuente)\s*:|\*\*|__|-{3,}|_{3,}|\[|[-*] \[|>|(?:notes?|links?|nota|enlaces|official|original (?:web(?:toon|novel)|novel|manhwa|manhua|manga|work)|also known|alternative|raws?|status)\b\s*:?)/i;

/** «(Source: WEBTOON)», «*(Source: Tapas, edited)*», «(From [LINE Webtoon](…))». */
const FUENTE = /\*?\s*[([]\s*(?:source|from|fuente|desde)\b\s*:?(?:[^()[\]]|\[[^\]]*\]|\([^)]*\))*[)\]]\s*\*?/gi;

export function limpiarSinopsis(texto: string | null | undefined): string {
  const parrafos = String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const historia: string[] = [];
  for (const p of parrafos) {
    if (FICHA.test(p)) {
      // Una nota ANTES de la historia («Note: esta obra…») se salta; una vez
      // empezada la historia, la primera línea de ficha cierra la sinopsis.
      if (historia.length) break;
      continue;
    }
    historia.push(p);
  }
  return historia
    .map((p) =>
      p
        .replace(FUENTE, ' ')
        // «*Source: Line Webtoon*» al final del párrafo, sin paréntesis.
        .replace(/\*?\s*\b(?:source|fuente)\s*:[^*\n]*\*?\s*$/gim, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\*\*|__/g, '')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ +([.,;:!?])/g, '$1')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n');
}

/** El título tal cual llega a veces: con espacios o el «hangul filler» (U+3164) pegado. */
export const limpiarTitulo = (t: string | null | undefined) =>
  String(t ?? '')
    .replace(/[ㅤ​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
