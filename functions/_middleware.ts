/**
 * Cloudflare Pages Function (middleware): un solo dominio de verdad, con 301.
 *
 * Dos hostnames servían el sitio ENTERO con 200: el gratuito *.pages.dev y el
 * dominio sin `www`. El canonical evitaba que Google los indexara, pero no que
 * los RASTREARA: con ~235.000 URLs, el apex se llevaba la mitad del presupuesto
 * de rastreo para servir una copia que nunca iba a aparecer en los resultados.
 * Medido en Search Console: 9.442 páginas en «Descubierta: actualmente sin
 * indexar», que es exactamente lo que pasa cuando el rastreo no llega.
 *
 * El 301 lo cierra: una URL, un rastreo. Y el poco enlace que reciban las otras
 * dos formas se acumula en la buena en vez de repartirse.
 *
 * Solo se redirige lo que sabemos que es el mismo sitio: el dominio gratuito y
 * el apex. `localhost`, `127.0.0.1` y las previews con hash siguen su camino, o
 * `wrangler pages dev` sería imposible de usar.
 *
 * Firma sin los tipos de Cloudflare (no están instalados) para no ensuciar el
 * typecheck; CF solo necesita el export `onRequest`.
 */
const CANONICO = 'www.manhwatonovel.com';
const APEX = 'manhwatonovel.com';

export const onRequest = async (context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();
  if (host !== CANONICO && (host === APEX || host.endsWith('.pages.dev'))) {
    url.protocol = 'https:';
    url.hostname = CANONICO;
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
};
