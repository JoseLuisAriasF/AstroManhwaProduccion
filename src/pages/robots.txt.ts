import type { APIRoute } from 'astro';

/**
 * robots.txt generado, no estático: la línea `Sitemap:` DEBE llevar el dominio
 * real. Estaba a mano y apuntaba a un placeholder (`tudominio.com`), así que
 * Google nunca encontró el sitemap y las ~6.500 fichas no entraban al índice.
 * Generándolo desde `Astro.site` no se puede volver a desincronizar.
 */
export const GET: APIRoute = ({ site }) => {
  const base = site?.href.replace(/\/$/, '') ?? '';
  return new Response(
    `User-agent: *
Allow: /

# /admin es una herramienta interna, no contenido.
Disallow: /admin

Sitemap: ${base}/sitemap-index.xml
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};
