import type { APIRoute } from 'astro';
import { getNovelas } from '@/lib/api';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /portadas.json — de dónde saca cada portada el proxy del edge
 * ─────────────────────────────────────────────────────────────────────────────
 * Las portadas viven en el sitio de origen (una scan, MangaDex…). Servirlas por
 * `/portada/<slug>.jpg` —nuestro dominio— es lo que las hace indexables en
 * Google Imágenes, que en este nicho es un canal grande y hoy se lo lleva
 * entero la scan. Ver `functions/portada/[slug].ts`.
 *
 * El proxy necesita saber, dado un slug, qué URLs probar. Podría llevar la URL
 * en la ruta, pero eso convierte el dominio en un proxy abierto: cualquiera
 * pediría `/portada/<lo-que-sea>` y saldría de nuestra IP. Con este mapa la
 * lista de destinos es CERRADA: solo se busca lo que está en el catálogo.
 *
 * Hasta 3 candidatas por obra: la principal y las que vieron otras fuentes, que
 * es lo que salva la portada cuando una scan borra la imagen. Más de 3 solo
 * infla un archivo que el edge descarga entero.
 */
export const GET: APIRoute = async () => {
  const novelas = await getNovelas();
  const mapa: Record<string, string[]> = {};
  for (const n of novelas) {
    const urls = (n.portadas ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 3);
    if (urls.length) mapa[n.slug] = urls;
  }
  return new Response(JSON.stringify(mapa), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
