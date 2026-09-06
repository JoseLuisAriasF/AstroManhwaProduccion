import type { APIRoute } from 'astro';
import { fuentesSoloEnlace } from '@/lib/soloEnlace';

/**
 * /fuentes-enlace.json — los ids de las fuentes que NO listan capítulos.
 *
 * Lo consume `functions/novela/[slug]/[capitulo].ts` (una vez por isolate, como
 * el proxy de portadas hace con `/portadas.json`) para no publicar una página
 * de capítulo cuya única fuente enlaza al índice de la serie. El sitemap usa la
 * misma lista, así que sitemap y función no pueden discrepar. Ver
 * `src/lib/soloEnlace.ts` para por qué esto no se calcula en el edge.
 */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await fuentesSoloEnlace()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
