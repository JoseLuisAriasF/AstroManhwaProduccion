/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OBRAS RETIRADAS POR DMCA
 * ─────────────────────────────────────────────────────────────────────────────
 * El descubridor las vuelve a traer cada noche, así que —igual que `esProhibida`
 * (ver indexacion.ts)— el filtro vive en CÓDIGO, no en la BD: poner
 * `publicada=false` en Supabase lo deshace el siguiente scrapeo. Un slug aquí, en
 * cambio, lo saca en cada build y en cada petición del edge, para siempre.
 *
 * Añadir un slug lo elimina de: la ficha /novela/<slug>/, el catálogo, el
 * sitemap, /novedades, el RSS y las páginas de capítulo del edge. El sitio nunca
 * alojó el contenido —solo enlazaba a la fuente— pero esto corta hasta el enlace.
 *
 * Se puede añadir a mano o con el workflow `.github/workflows/dmca-retirar.yml`
 * (pegar la URL o el slug, un clic → commit → Cloudflare reconstruye sin la obra).
 */
export const RETIRADAS = new Set<string>([
  'pasion', // Marq Vision / Tappytoon (passion-m) — 2026-09-22
]);

/** true si la obra fue retirada por DMCA y no debe existir en ninguna parte. */
export const esRetirada = (slug: string): boolean => RETIRADAS.has(slug);
