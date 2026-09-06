import type { APIRoute } from 'astro';
import { nPaginas, rutasDePagina } from '@/lib/sitemapCapitulos';

/**
 * /sitemap-capitulos-1.xml, -2.xml… Las URLs de capítulo, que no son archivos
 * (las sirve `functions/novela/[slug]/[capitulo].ts`) y por eso no las recoge
 * `@astrojs/sitemap`, que solo lista páginas generadas.
 *
 * `robots.txt` los anuncia uno a uno: varias líneas `Sitemap:` son válidas y
 * Google las lee todas. Aparte del `sitemap-index.xml`, a propósito: así el
 * índice principal sigue siendo el del contenido propio y en Search Console se
 * ve por separado cuánto de ESTO se indexa, que es el número que decide si el
 * experimento sigue o se recorta.
 */
export async function getStaticPaths() {
  const n = await nPaginas();
  return Array.from({ length: n }, (_, i) => ({ params: { pagina: String(i + 1) } }));
}

export const GET: APIRoute = async ({ params, site }) => {
  const base = site?.href.replace(/\/$/, '') ?? '';
  const rutas = await rutasDePagina(Number(params.pagina));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rutas.map((r) => `<url><loc>${base}${r}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
