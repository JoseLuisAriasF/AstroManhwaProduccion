/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SE PUEDE ABRIR EN EL VISOR
 * ─────────────────────────────────────────────────────────────────────────────
 * El capítulo se lee dentro del sitio, en `/leer?u=…`, que lo pide a la fuente y
 * lo devuelve tal cual (ver `functions/leer.ts`). Eso funciona con TODAS las
 * fuentes —la primera versión iba por iframe directo y solo el 42,8 % de los
 * capítulos se dejaba: `X-Frame-Options` lo decide el navegador y no hay truco
 * de cliente que lo salte—.
 *
 * **La lista de dominios es cerrada, y esa es la parte importante.** Sin ella
 * `/leer?u=` sería un proxy abierto: cualquiera pediría lo que quisiera desde
 * nuestra IP. Aquí solo entran los 23 dominios que están de verdad en el
 * catálogo. Es el mismo criterio que `/portadas.json` con las portadas.
 *
 * Se regenera con `npm run dominios` cuando se añade un sitio nuevo. Si un
 * dominio falta, su capítulo no se rompe: se abre en pestaña como siempre.
 */
export const DOMINIOS = [
  'imperiomanhua.com',
  'leemiau.com',
  'anslid.com',
  'animeshoy12.blogspot.com',
  'animeshoy12.com',
  'mangadex.org',
  'wetriedtls.com',
  'samurai.j5z.xyz',
  'asurascans.com',
  'legionscans.com',
  'manhwaweb.com',
  'webtoons.com',
  'maehwasup.com',
  'animerikosuper.blogspot.com',
  'olympusxyz.com',
  'sinacortadores.com',
  'daotranslate.com',
  'wtr-lab.com',
  'readtoon.com',
  'readrealm.co',
  'kaichan.co',
  'kairew.com',
  'esponsor.com',
];

/**
 * ¿Es una URL de una fuente del catálogo?
 *
 * Acepta subdominios (`cdn.leemiau.com` cuenta) pero NO un dominio que solo
 * TERMINE igual: `noleemiau.com` no es leemiau.com, y sin el punto del
 * `endsWith` cualquiera registra ese dominio y usa el proxy. Solo http(s):
 * `file:` o `data:` en un `fetch` del edge no llevan a nada bueno.
 */
export function esFuenteDelCatalogo(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  return DOMINIOS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** La URL del visor para un capítulo. `encodeURIComponent` y no un `+`: los
 *  enlaces de las scans llevan `?`, `&` y `#` de sobra. */
export const urlDeLectura = (url: string) => `/leer?u=${encodeURIComponent(url)}`;
