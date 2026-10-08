import type { Idioma } from './i18n.ts';
import { ruta } from './i18n.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DATOS ESTRUCTURADOS QUE SE REPITEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada página arma su JSON-LD principal (Book, Chapter, CollectionPage). Lo que
 * vive aquí es lo que TODAS comparten y no vale la pena copiar cuatro veces.
 *
 * `Base.astro` acepta un objeto o un array: un array se serializa como varios
 * nodos JSON-LD sueltos, que es exactamente lo que Google espera cuando una
 * página describe dos cosas a la vez (la obra y su ruta de migas).
 */

export interface Miga {
  nombre: string;
  /** Ruta ya localizada (la que devuelve `ruta()`), o absoluta. */
  href: string;
}

/**
 * BreadcrumbList a partir de las migas que la página YA pinta en pantalla.
 *
 * Importa que sean las mismas: Google compara el marcado con lo visible y
 * descarta el rich result si no coinciden. Por eso esto recibe la lista, no la
 * adivina de la URL.
 *
 * El último elemento va SIN `item`: es la página actual y marcarla como enlace
 * a sí misma es el error clásico que invalida la miga entera.
 */
export function migas(site: URL | undefined, items: Miga[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: m.nombre,
      ...(i < items.length - 1 ? { item: new URL(m.href, site).toString() } : {}),
    })),
  };
}

/** Las migas de inicio → novelas, que son el prefijo de casi todas las páginas. */
export const migasBase = (idioma: Idioma, dic: { navInicio: string; navNovelas: string }): Miga[] => [
  { nombre: dic.navInicio, href: ruta(idioma) },
  { nombre: dic.navNovelas, href: ruta(idioma, '/novelas') },
];

export interface Pregunta {
  pregunta: string;
  /** Texto plano. DEBE estar también visible en la página, o Google lo ignora. */
  respuesta: string;
}

/**
 * FAQPage. Solo tiene sentido si las preguntas están escritas en el HTML: el
 * marcado sin contenido visible es una penalización esperando a ocurrir, no un
 * atajo. Se usa en la página de equivalencia, donde la pregunta ES la página.
 */
export function faq(preguntas: Pregunta[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: preguntas.map((p) => ({
      '@type': 'Question',
      name: p.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
    })),
  };
}

/**
 * Tipo de serie según los formatos que la obra TIENE indexados. Un solo sitio
 * decide: ficha y carrusel lo usan igual, para que una misma obra no sea
 * `ComicSeries` en una página y `Book` en otra.
 */
export function tipoSerie(formatos: ReadonlyArray<'manhwa' | 'novela'>): 'CreativeWorkSeries' | 'BookSeries' | 'ComicSeries' {
  if (formatos.includes('manhwa') && formatos.includes('novela')) return 'CreativeWorkSeries';
  return formatos[0] === 'novela' ? 'BookSeries' : 'ComicSeries';
}

/**
 * Título de la ficha: «Título / Alterno — capítulo N», pero sin el alterno si
 * el conjunto pasa de ~65 caracteres. Google corta por encima de ~60 en el
 * resultado; un título cortado a media palabra pierde justo la parte útil.
 */
export function tituloFicha(principal: string, alterno: string | undefined, sufijo: string): string {
  const completo = [principal, alterno].filter((n, i, a) => n && a.indexOf(n) === i).join(' / ');
  const con = sufijo ? `${completo} — ${sufijo}` : completo;
  if (con.length <= 65) return con;
  return sufijo ? `${principal} — ${sufijo}` : principal;
}
