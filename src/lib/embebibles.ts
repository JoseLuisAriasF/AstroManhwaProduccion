/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ FUENTES SE ABREN DENTRO DEL SITIO
 * ─────────────────────────────────────────────────────────────────────────────
 * Al pinchar un capítulo se abre en una ventana sobre la ficha, y el lector no
 * pierde dónde estaba. Pero eso solo funciona si el sitio de origen lo permite:
 * la mayoría manda `X-Frame-Options` o `frame-ancestors`, y entonces el marco
 * sale **en blanco sin avisar**, que es peor que la pestaña nueva de siempre.
 *
 * Por eso la ventana solo se usa con los dominios que se han probado. El resto
 * sigue abriéndose en una pestaña, exactamente como hasta ahora: la función
 * degrada, no rompe.
 *
 * La lista sale de `npm run embebibles`, que prueba una URL real de cada
 * dominio del catálogo (cabecera, CSP, `<meta>` y frame-busting por JS). Última
 * medición sobre 264.832 capítulos: **42,8 % se dejan abrir dentro**. Lo que
 * queda fuera es sobre todo imperiomanhua (34,1 % del catálogo él solo) y
 * anslid, los dos con `X-Frame-Options`.
 *
 * ⚠ Es una foto, no una ley. Añadir esa cabecera es lo primero que hace una
 * scan cuando le molesta el tráfico de fuera, así que conviene volver a correr
 * el script cada cierto tiempo. Que un dominio deje de permitirlo no rompe
 * nada: el marco sale vacío y el enlace «Abrir en …» sigue ahí.
 */
export const EMBEBIBLES = [
  'leemiau.com',
  'animeshoy12.blogspot.com',
  'samurai.j5z.xyz',
  'asurascans.com',
  'legionscans.com',
  'manhwaweb.com',
  'maehwasup.com',
  'animerikosuper.blogspot.com',
  'olympusxyz.com',
  'sinacortadores.com',
  'wtr-lab.com',
];

/**
 * ¿Se puede abrir esta URL dentro del sitio?
 *
 * Compara el host sin `www.` y acepta subdominios (`cdn.leemiau.com` cuenta
 * como leemiau.com), pero NO un dominio que solo TERMINE igual: `noleemiau.com`
 * no es leemiau.com. Es la diferencia entre un `endsWith` y este `.`.
 */
export function esEmbebible(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return false;
  }
  return EMBEBIBLES.some((d) => host === d || host.endsWith(`.${d}`));
}
