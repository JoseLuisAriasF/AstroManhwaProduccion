/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTADO DE ADAPTACIÓN: ¿manhwa, novela o ambos?
 * ─────────────────────────────────────────────────────────────────────────────
 * Un dato explícito en CADA ficha, aunque sea "sin novela conocida". Es lo que
 * diferencia una página delgada de otra: 5.235 fichas indexables no tenían
 * prosa propia, y decir qué formato(s) existen las vuelve algo distinto entre sí
 * sin copiar nada de fuera (es dato nuestro, derivado de las fuentes).
 *
 * Se DERIVA de `formatos(externos)` —los tipos presentes en capitulos_externos—,
 * no de `obras.tipo`: esa columna se quedó obsoleta (73 filas 'ambos' cuando la
 * realidad derivada son 2.132). Derivar en build no se pudre y no añade queries
 * ni egreso (capa gratuita). Módulo puro: lo prueba `adaptacion.test.ts`.
 */

export type Adaptacion = 'ambos' | 'solo_manhwa' | 'solo_novela' | 'desconocido';

/** De los formatos indexados (derivados de las fuentes) al estado de adaptación. */
export function adaptacionDe(formatos: ReadonlyArray<'manhwa' | 'novela'>): Adaptacion {
  const m = formatos.includes('manhwa');
  const n = formatos.includes('novela');
  if (m && n) return 'ambos';
  if (m) return 'solo_manhwa';
  if (n) return 'solo_novela';
  return 'desconocido';
}

/** Frase visible, en la página (lo que Google indexa). ES por defecto, EN en /en/,
 *  igual que el resto del texto propio de la ficha (ver introGenerada en [slug]). */
export function etiquetaAdaptacion(a: Adaptacion, idioma: string): string {
  const en = idioma === 'en';
  switch (a) {
    case 'ambos':
      return en ? 'Available as both manhwa and novel.' : 'Disponible como manhwa y novela.';
    case 'solo_manhwa':
      return en ? 'Only the manhwa is indexed; no novel known yet.' : 'Solo el manhwa está indexado; sin novela conocida aún.';
    case 'solo_novela':
      return en ? 'Only the novel is indexed; no manhwa known yet.' : 'Solo la novela está indexada; sin manhwa conocido aún.';
    case 'desconocido':
      return en ? 'No sources indexed yet.' : 'Sin fuentes indexadas aún.';
  }
}
