import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@tailwindcss/vite';
import { CODIGOS, IDIOMA_BASE, IDIOMAS } from './src/lib/i18n';

// Un solo sitio de verdad para los idiomas: src/lib/i18n.ts.
// Añadir uno ahí lo propaga a rutas, sitemap, hreflang y selector.
const localesSitemap = Object.fromEntries(
  CODIGOS.map((c) => [c, IDIOMAS[c].htmlLang]),
) as Record<string, string>;

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
    }),
  ],
  vite: { plugins: [tailwind()] },
});
