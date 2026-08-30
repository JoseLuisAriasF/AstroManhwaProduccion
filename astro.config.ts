import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@tailwindcss/vite';
import { CODIGOS, IDIOMA_BASE, IDIOMAS } from './src/lib/i18n';
import { metaSitemap } from './src/lib/sitemapMeta';

// Un solo sitio de verdad para los idiomas: src/lib/i18n.ts.
// Añadir uno ahí lo propaga a rutas, sitemap, hreflang y selector.
const localesSitemap = Object.fromEntries(
  CODIGOS.map((c) => [c, IDIOMAS[c].htmlLang]),
) as Record<string, string>;

// Metadatos por obra (fecha real + si es "ambos"), una lectura antes de generar
// el sitemap. `serialize` de @astrojs/sitemap v3 es SÍNCRONO, así que el mapa se
// precarga aquí con top-level await y luego se consulta sin esperar.
const metaObras = await metaSitemap();

/** El slug de una URL de ficha (/novela/<slug> o /<idioma>/novela/<slug>), o null.
 *  Las páginas de capítulo (/novela/<slug>/capitulo-N) no matchean: su último
 *  segmento no es el slug, y se quedan con la prioridad por defecto. */
const slugFicha = (u: string) => new URL(u).pathname.match(/\/novela\/([^/]+)\/?$/)?.[1] ?? null;

export default defineConfig({
  site: process.env.SITE_URL || 'https://manhwatonovel.example.com',
  output: 'static',
  i18n: {
    defaultLocale: IDIOMA_BASE,
    locales: [...CODIGOS],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: IDIOMA_BASE, locales: localesSitemap },
      // /admin es una herramienta interna, no contenido. Fuera del sitemap
      // (y con noindex en su <head>) para que no se rastree ni se indexe.
      filter: (pagina) => !pagina.includes('/admin'),
      // `lastmod` real y `priority` por tipo de página, para que Google no gaste
      // el rastreo por igual en 8.600 URLs: prioriza la portada, las páginas
      // propias y las fichas "ambos" (el contenido único), y con la fecha del
      // último capítulo sabe cuáles re-rastrear.
      serialize(item) {
        // `as typeof item`: el tipo de `changefreq` es un ENUM del paquete
        // sitemap, y un literal 'daily' no le encaja aunque valga en runtime.
        const path = new URL(item.url).pathname;
        // Portada (con o sin prefijo de idioma).
        if (path === '/' || /^\/[a-z]{2}\/?$/.test(path)) {
          return { ...item, priority: 1.0, changefreq: 'daily' } as typeof item;
        }
        const slug = slugFicha(item.url);
        if (slug) {
          const meta = metaObras.get(slug);
          return {
            ...item,
            ...(meta?.lastmod ? { lastmod: new Date(meta.lastmod).toISOString() } : {}),
            priority: meta?.ambos ? 0.9 : 0.6,
            changefreq: 'weekly',
          } as typeof item;
        }
        // Páginas propias de alto valor (series, rankings, novedades…).
        if (/\/(series|rankings|novedades|titulos)(\/|$)/.test(path)) {
          return { ...item, priority: 0.8, changefreq: 'daily' } as typeof item;
        }
        return item;
      },
    }),
  ],
  vite: { plugins: [tailwind()] },
});
