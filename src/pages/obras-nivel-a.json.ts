import type { APIRoute } from 'astro';
import { niveles } from '@/lib/catalogo';

/**
 * /obras-nivel-a.json — los slugs cuyas páginas de capítulo se indexan.
 *
 * Lo lee `functions/novela/[slug]/[capitulo].ts` una vez por isolate, igual que
 * `/fuentes-enlace.json`: el nivel se decide en el build con el mismo mapa que
 * arma el sitemap de capítulos, y el edge no lo recalcula. Así una página de
 * capítulo no puede estar en el sitemap y servirse con noindex, ni al revés.
 */
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify([...(await niveles())].filter(([, nivel]) => nivel === 'A').map(([slug]) => slug)),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
