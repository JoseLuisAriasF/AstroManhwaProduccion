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
import { slugGeneroCanonico } from '../src/lib/generos.ts';
import { CODIGOS, IDIOMA_BASE } from '../src/lib/i18n.ts';
import { esRetirada, extraerSlugDeRuta } from '../src/lib/dmca.ts';

const CANONICO = 'www.manhwatonovel.com';
const APEX = 'manhwatonovel.com';

const PREFIJO = new RegExp(`^/(?:${CODIGOS.filter((c) => c !== IDIOMA_BASE).join('|')})(/.*)?$`);

/**
 * Adónde mandar un 404 que tiene arreglo, o null. Search Console listaba 55:
 *
 * - `/pt/novela/x/`, `/de/…`, `/fr/…`: idiomas que se publicaron y ya no
 *   (i18n.ts → ACTIVOS), y fichas /en/ que no existen porque la obra no tiene
 *   prosa traducida. Google las conoce por enlaces y hreflang viejos: la misma
 *   página en español es su destino natural, y el 301 le pasa lo que acumularon.
 * - `/novela/x-capitulo-86`: un enlace externo mal armado, sin la barra.
 * - `/categoria/action/`: los géneros tenían slug en inglés; ahora en español
 *   (`/categoria/accion/`, ver src/lib/generos.ts).
 *
 * Solo se mira DESPUÉS de un 404: una ruta que existe nunca se redirige.
 */
export function reparar(pathname: string): string | null {
  const idioma = PREFIJO.exec(pathname);
  if (idioma) return idioma[1] || '/';
  const cap = /^\/novela\/(.+)-capitulo-(\d+)\/?$/.exec(pathname);
  if (cap) return `/novela/${cap[1]}/capitulo-${cap[2]}`;
  const cat = /^\/categoria\/([^/]+)\/?$/.exec(pathname);
  const bueno = cat && slugGeneroCanonico(cat[1]);
  if (bueno) return `/categoria/${bueno}/`;
  return null;
}

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

  // Intercepción Edge DMCA: 410 Gone inmediato para obras retiradas (ver src/lib/dmca.ts)
  const slug = extraerSlugDeRuta(url.pathname);
  if (slug && esRetirada(slug)) {
    return new Response(
      `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>410 Contenido Retirado por DMCA</title>
</head>
<body style="font-family: system-ui, sans-serif; background:#121316; color:#e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; padding:1rem;">
  <div style="max-width:500px; background:#1e2025; padding:2rem; border-radius:1rem; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
    <h1 style="color:#ef4444; font-size:1.5rem; margin-top:0;">410 — Contenido Retirado (DMCA)</h1>
    <p style="color:#94a3b8; font-size:0.95rem; line-height:1.6;">Esta obra ha sido retirada permanentemente de nuestro servicio en cumplimiento con una solicitud por derechos de autor (DMCA).</p>
    <a href="/" style="display:inline-block; margin-top:1rem; padding:0.5rem 1.25rem; background:#3b82f6; color:#fff; text-decoration:none; border-radius:0.5rem; font-weight:500;">Volver al Inicio</a>
  </div>
</body>
</html>`,
      {
        status: 410,
        statusText: 'Gone',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
          'Cache-Control': 'public, max-age=3600',
        },
      },
    );
  }

  const res = await context.next();
  if (res.status !== 404 || context.request.method !== 'GET') return res;
  const destino = reparar(url.pathname);
  return destino ? Response.redirect(new URL(destino + url.search, url).toString(), 301) : res;
};
