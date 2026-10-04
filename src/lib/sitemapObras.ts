import { getActividad, getNovelas } from './api';
import { niveles } from './catalogo';
import { IDIOMAS, ruta } from './i18n';
import type { Nivel } from './indexacion';
import { idiomasDeObra } from './publicables';

/**
 * Sitemaps de fichas, partidos por nivel (ver `src/lib/indexacion.ts`):
 *
 *   /sitemap-ambos.xml  las A —manhwa Y novela—: ficha + /equivalencia, en es y en,
 *                       con hreflang dentro del sitemap. Va primero en el índice.
 *   /sitemap-obras.xml  las B —un solo formato—: solo la ficha en español.
 *
 * Partidos para que Search Console dé la cobertura de las A por separado: es el
 * catálogo que importa y así se ve, sin mezclar con 11.000 B, cuántas indexó.
 *
 * Antes las fichas las listaba `@astrojs/sitemap`, que ve todas las páginas del
 * build y no sabe cuáles llevan noindex. Aquí salen del MISMO mapa de niveles
 * que decide el noindex de la página: una URL no puede estar en el sitemap y con
 * noindex. Entran en `sitemap-index.xml` por `customSitemaps` (astro.config.ts).
 */
export async function sitemapDeObras(site: URL, nivel: Exclude<Nivel, 'C'>): Promise<Response> {
  const base = site.href.replace(/\/$/, '');
  const mapa = await niveles();
  const cuando = new Map((await getActividad()).map((a) => [a.slug, a.cuando]));

  const urls: string[] = [];
  for (const n of await getNovelas()) {
    if (mapa.get(n.slug) !== nivel) continue;
    const lastmod = cuando.get(n.slug) ? `<lastmod>${new Date(cuando.get(n.slug)!).toISOString()}</lastmod>` : '';
    // Sitemap de imagen: la portada va por NUESTRO dominio (functions/portada/)
    // y se pinta dentro de tarjetas, no como imagen principal; declararla es lo
    // que la mete en Google Imágenes a nuestro nombre.
    const img = n.portadaUrl.startsWith('/portada/')
      ? `<image:image><image:loc>${base}${n.portadaUrl}</image:loc></image:image>`
      : '';
    const idiomas = idiomasDeObra(n);
    // La /equivalencia existe en los mismos idiomas que la ficha, y solo en las A.
    const rutas = nivel === 'A' ? [`/novela/${n.slug}`, `/novela/${n.slug}/equivalencia`] : [`/novela/${n.slug}`];
    for (const r of rutas) {
      // hreflang también aquí, no solo en el <head>: Google lo lee de las dos
      // partes y en el sitemap lo ve sin tener que rastrear cada versión. Igual
      // que Base.astro, x-default al inglés: si discrepan, Google ignora ambos.
      const alternas =
        idiomas.length > 1
          ? [...idiomas.map((i) => [IDIOMAS[i].htmlLang, ruta(i, r)]), ['x-default', ruta('en', r)]]
              .map(([h, href]) => `<xhtml:link rel="alternate" hreflang="${h}" href="${base}${href}"/>`)
              .join('')
          : '';
      for (const idioma of idiomas) {
        urls.push(`<url><loc>${base}${ruta(idioma, r)}</loc>${lastmod}${alternas}${r.endsWith('/equivalencia') ? '' : img}</url>`);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
