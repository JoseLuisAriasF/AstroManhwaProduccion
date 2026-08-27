import { CODIGOS, IDIOMAS, IDIOMA_BASE, ruta, rutaCanonica, type Idioma } from './i18n';
import { capitulosDe, novelas } from './mockData';
import { cobertura } from './traducir';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ IDIOMAS SE PUBLICAN DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────────
 * Estar en IDIOMAS solo declara la intención. Un idioma sale a producción
 * cuando su contenido está traducido por encima del umbral — antes no.
 *
 * Sin esta compuerta, añadir 'fr' generaría 487 páginas francesas con el texto
 * en español: contenido duplicado, justo lo que hunde un sitio multiidioma.
 * Con ella, /fr/ simplemente no existe hasta que `npm run traducir` lo llene,
 * y entonces aparece solo — rutas, hreflang, sitemap y selector incluidos.
 *
 * ⚠ Módulo de build: arrastra el caché completo de traducciones.
 *   No lo importes desde scripts de cliente.
 */

const UMBRAL = 0.95;

// ponytail: la compuerta mide el corpus de mockData, no las obras de Supabase.
// Sigue siendo correcta porque de las obras descubiertas no se publica prosa —
// la sinopsis nace vacía y el índice de capítulos no se traduce, es el título
// literal de la fuente. En cuanto se escriban sinopsis a mano en `obras`, este
// módulo tiene que medirlas también o /fr/ saldrá con texto en español.

const textos = [
  ...novelas.flatMap((n) => [n.titulo, n.sinopsis]),
  ...novelas.flatMap((n) =>
    capitulosDe(n.slug).flatMap((c) => [c.titulo, ...c.contenidoTexto.split('\n\n')]),
  ),
];
const unicos = [...new Set(textos)];

export const PUBLICADOS: Idioma[] = CODIGOS.filter(
  (c) => c === IDIOMA_BASE || cobertura(unicos, c) >= UMBRAL,
);

/** Informe para el build: qué salió y qué se quedó fuera, y por qué. */
export function informe() {
  return CODIGOS.map((c) => ({
    idioma: c,
    publicado: PUBLICADOS.includes(c),
    cobertura: c === IDIOMA_BASE ? 1 : cobertura(unicos, c),
  }));
}

/** El param de ruta de cada idioma publicado. El base va sin prefijo. */
export function paramsDeIdioma() {
  return PUBLICADOS.map((idioma) => ({
    idioma: idioma === IDIOMA_BASE ? undefined : idioma,
    codigo: idioma,
  }));
}

/**
 * En qué idiomas se publica UNA obra. Solo las que tienen prosa traducible
 * —sinopsis escrita a mano— justifican una versión por idioma; el catálogo
 * descubierto (título literal, sinopsis vacía) en /en/, /pt/… sería el mismo
 * español duplicado ×6: inútil para el lector, dañino para SEO y, a 8.600
 * obras, el build de Cloudflare no cabe en su límite de tiempo. Esas van solo
 * en el idioma base; las traducidas, en todos los publicados.
 */
export function idiomasDeObra(novela: { sinopsis?: string }): Idioma[] {
  return novela.sinopsis?.trim() ? PUBLICADOS : [IDIOMA_BASE];
}

/**
 * Versiones de una misma página, para hreflang y para el selector. Por defecto
 * son todos los idiomas publicados; una ficha de obra pasa solo los suyos
 * (ver idiomasDeObra) para no anunciar hreflang a páginas que no existen.
 */
export function alternativas(pathname: string, idiomas: Idioma[] = PUBLICADOS) {
  const base = rutaCanonica(pathname);
  return idiomas.map((idioma) => ({
    idioma,
    hreflang: IDIOMAS[idioma].htmlLang,
    href: ruta(idioma, base),
  }));
}
