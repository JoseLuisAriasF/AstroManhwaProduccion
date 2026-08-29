/**
 * Cloudflare Pages Function (middleware): redirige el dominio gratuito
 * *.pages.dev al dominio real con 301.
 *
 * Sin esto, el sitio vive en DOS URLs (astromanhwaproduccion.pages.dev y
 * manhwatonovel.com): las visitas y el poco enlace que reciba el .pages.dev no
 * suman al dominio bueno. El canonical ya evita que Google indexe el gratuito;
 * este 301 además manda a cualquier visita (y a los bots) al dominio real.
 *
 * Firma sin los tipos de Cloudflare (no están instalados) para no ensuciar el
 * typecheck; CF solo necesita el export `onRequest`.
 */
export const onRequest = async (context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const url = new URL(context.request.url);
  if (url.hostname.endsWith('.pages.dev')) {
    url.protocol = 'https:';
    url.hostname = 'www.manhwatonovel.com';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
};
