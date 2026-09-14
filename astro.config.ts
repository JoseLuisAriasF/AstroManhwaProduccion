import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@tailwindcss/vite';
import { CODIGOS, IDIOMA_BASE, IDIOMAS } from './src/lib/i18n';

// Un solo sitio de verdad para los idiomas: src/lib/i18n.ts.
// Añadir uno ahí lo propaga a rutas, sitemap, hreflang y selector.
const localesSitemap = Object.fromEntries(
  CODIGOS.map((c) => [c, IDIOMAS[c].htmlLang]),
) as Record<string, string>;

const SITE = process.env.SITE_URL || 'https://manhwatonovel.example.com';

export default defineConfig({
  site: SITE,
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
      // Las fichas (/novela/…) tampoco: van en /sitemap-obras.xml, que sabe
      // cuáles llevan noindex (ver src/lib/indexacion.ts). Este paquete no.
      filter: (pagina) => !pagina.includes('/admin') && !new URL(pagina).pathname.includes('/novela/'),
      customSitemaps: [`${SITE.replace(/\/$/, '')}/sitemap-obras.xml`],
      serialize(item) {
        // `as typeof item`: el tipo de `changefreq` es un ENUM del paquete
        // sitemap, y un literal 'daily' no le encaja aunque valga en runtime.
        const path = new URL(item.url).pathname;
        // Portada (con o sin prefijo de idioma).
        if (path === '/' || /^\/[a-z]{2}\/?$/.test(path)) {
          return { ...item, priority: 1.0, changefreq: 'daily' } as typeof item;
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
