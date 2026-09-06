import type { APIRoute } from 'astro';
import { nPaginas } from '@/lib/sitemapCapitulos';

/**
 * robots.txt generado, no estático: la línea `Sitemap:` DEBE llevar el dominio
 * real. Estaba a mano y apuntaba a un placeholder (`tudominio.com`), así que
 * Google nunca encontró el sitemap y las ~6.500 fichas no entraban al índice.
 * Generándolo desde `Astro.site` no se puede volver a desincronizar.
 */
export const GET: APIRoute = async ({ site }) => {
  const base = site?.href.replace(/\/$/, '') ?? '';
  // Los sitemaps de capítulo van aparte del índice: esas URLs no son archivos
  // del despliegue (las arma la función del edge), así que @astrojs/sitemap no
  // las ve. Varias líneas `Sitemap:` son válidas y Google las lee todas.
  const capitulos = Array.from(
    { length: await nPaginas() },
    (_, i) => `Sitemap: ${base}/sitemap-capitulos-${i + 1}.xml`,
  ).join('\n');
  return new Response(
    `User-agent: *
Allow: /

# /admin es una herramienta interna, no contenido.
Disallow: /admin

Sitemap: ${base}/sitemap-index.xml
${capitulos}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};
