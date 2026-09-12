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

/**
 * Fuentes del catálogo que NO se dejan LEER dentro del visor. Dos motivos, uno
 * por bloque:
 *
 *  · Apps JS (Nuxt/React/Next) que no traen el capítulo en el HTML: lo dibuja su
 *    JavaScript llamando a SU API, y esa llamada sale ahora desde nuestro
 *    dominio. Si su CORS no lo permite —y ninguna lo permite— el visor sale en
 *    blanco o revienta con «Application error». Medido en las cuatro.
 *  · Su Cloudflare responde 403 a un fetch de servidor (anti-bot): el HTML no
 *    llega y `/leer` solo puede enseñar el aviso.
 *
 * Para estas, el capítulo NO abre el visor: se abre en pestaña como un enlace
 * normal, donde el navegador del lector —con sus cookies y su JS— sí las hace
 * funcionar. Es el mismo trato que un dominio fuera del catálogo (ver
 * CapitulosExternos: sin `data-visor-src`, el `href` a la fuente manda).
 *
 * Lista corta y a mano a propósito, como `DOMINIOS`: son 23 fuentes, no cambian
 * de tecnología en una tarde, y una heurística en cliente no puede mirar dentro
 * de un iframe de otro origen para saber si pintó algo.
 */
export const SIN_VISOR = [
  // Escudo anti-embed: sirve el capítulo con las imágenes en blanco
  // (`data-lm-orig-src`) y un script las dibuja en un <canvas> solo si la página
  // corre en su propio dominio; fuera de él salen negras. Restaurarlas desde el
  // edge no basta —su JS las vuelve a tapar en el navegador— y encima responde
  // distinto a un fetch de servidor. En pestaña (su dominio) sí cargan.
  'leemiau.com',
  // Apps JS que dibujan el capítulo desde su API (visor en blanco):
  'olympusxyz.com',
  'mangadex.org',
  'manhwaweb.com',
  'wtr-lab.com',
  'wetriedtls.com',
  'webtoons.com',
  'esponsor.com',
  // Cloudflare 403 al fetch del edge (no llega el HTML):
  'daotranslate.com',
  'readtoon.com',
  'kairew.com',
  'readrealm.co',
  'kaichan.co',
];

/**
 * ¿El capítulo se puede LEER dentro del visor? Tiene que ser del catálogo y no
 * estar en `SIN_VISOR`. Cuando devuelve false, el enlace se abre en pestaña.
 */
export function abreEnVisor(url: string): boolean {
  if (!esFuenteDelCatalogo(url)) return false;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return false;
  }
  return !SIN_VISOR.some((d) => host === d || host.endsWith(`.${d}`));
}

/** La URL del visor para un capítulo. `encodeURIComponent` y no un `+`: los
 *  enlaces de las scans llevan `?`, `&` y `#` de sobra. */
export const urlDeLectura = (url: string) => `/leer?u=${encodeURIComponent(url)}`;
