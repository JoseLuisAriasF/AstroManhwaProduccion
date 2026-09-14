import type { APIRoute } from 'astro';
import { getActividad, getNovelas } from '@/lib/api';
import { niveles } from '@/lib/catalogo';
import { ruta } from '@/lib/i18n';
import { idiomasDeObra, PUBLICADOS } from '@/lib/publicables';

/**
 * /sitemap-obras.xml — las fichas que SÍ queremos en Google (niveles A y B, ver
 * `src/lib/indexacion.ts`) y la /equivalencia de las A.
 *
 * Antes las fichas las listaba `@astrojs/sitemap`, que ve todas las páginas del
 * build y no sabe cuáles llevan noindex: el sitemap ofrecía ~9.400 fichas de las
 * que Google había indexado 347. Ese paquete solo tiene un `serialize` síncrono,
 * que no puede esperar al mapa de niveles, así que las fichas salen de ahí
 * (filtro en `astro.config.ts`) y se listan aquí, desde el MISMO mapa que decide
 * el noindex de la página. Una URL no puede estar en el sitemap y con noindex.
 *
 * Entra en `sitemap-index.xml` por `customSitemaps`.
 */
export const GET: APIRoute = async ({ site }) => {
  const base = site!.href.replace(/\/$/, '');
  const mapa = await niveles();
  const cuando = new Map((await getActividad()).map((a) => [a.slug, a.cuando]));

  const urls: string[] = [];
  for (const n of await getNovelas()) {
    const nivel = mapa.get(n.slug);
    if (nivel !== 'A' && nivel !== 'B') continue;
    const lastmod = cuando.get(n.slug) ? `<lastmod>${new Date(cuando.get(n.slug)!).toISOString()}</lastmod>` : '';
    // Sitemap de imagen: la portada va por NUESTRO dominio (functions/portada/)
    // y se pinta dentro de tarjetas, no como imagen principal; declararla es lo
    // que la mete en Google Imágenes a nuestro nombre.
    const img = n.portadaUrl.startsWith('/portada/')
      ? `<image:image><image:loc>${base}${n.portadaUrl}</image:loc></image:image>`
      : '';
    for (const idioma of idiomasDeObra(n).filter((c) => PUBLICADOS.includes(c))) {
      urls.push(
        `<url><loc>${base}${ruta(idioma, `/novela/${n.slug}`)}</loc>${lastmod}<priority>${nivel === 'A' ? '0.9' : '0.6'}</priority>${img}</url>`,
      );
    }
    // La /equivalencia existe en los mismos idiomas que la ficha.
    if (nivel === 'A') {
      for (const idioma of idiomasDeObra(n).filter((c) => PUBLICADOS.includes(c))) {
        urls.push(`<url><loc>${base}${ruta(idioma, `/novela/${n.slug}/equivalencia`)}</loc>${lastmod}<priority>0.8</priority></url>`);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
