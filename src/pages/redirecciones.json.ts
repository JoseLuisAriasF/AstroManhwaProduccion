import type { APIRoute } from 'astro';
import { getNovelas } from '@/lib/api';

/**
 * /redirecciones.json — { slugViejo: slugNuevo } de las fichas fusionadas.
 *
 * `fusionar.mjs` borra la ficha absorbida; sin esto su URL (que Google ya tenía
 * indexada) quedaba en 404 para siempre. Lo lee el middleware SOLO tras un 404,
 * así que no cuesta nada a las páginas que existen.
 */
export const GET: APIRoute = async () => {
  const mapa: Record<string, string> = {};
  for (const n of await getNovelas()) for (const viejo of n.slugsAntiguos ?? []) mapa[viejo] = n.slug;
  return new Response(JSON.stringify(mapa), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
