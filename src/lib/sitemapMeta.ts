import { createClient } from '@supabase/supabase-js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Metadatos por obra para el sitemap: última actividad y si es "ambos"
 * ─────────────────────────────────────────────────────────────────────────────
 * El sitemap ponía la MISMA fecha (la del build) en las 8.600 URLs. Con eso
 * Google no distingue lo que cambió de lo que lleva meses quieto, y reparte el
 * presupuesto de rastreo a ciegas. Aquí se saca, por obra, la fecha de su último
 * capítulo y si tiene los dos formatos, para que `astro.config.ts` ponga un
 * `lastmod` real y una `priority` acorde (las "ambos" son el contenido único).
 *
 * Se lee de `fuentes` (~11.000 filas), no de `capitulos_externos` (~150.000):
 * `fuentes.ultimo_cambio` ya trae la fecha del último crecimiento de cada
 * fuente, así que sale una lectura ligera en vez de escanear todos los capítulos.
 *
 * Sin credenciales devuelve un mapa vacío y el sitemap cae a sus valores por
 * defecto: nunca rompe el build.
 */
export interface MetaObra {
  /** ISO de la última actividad de la obra (máximo entre sus fuentes). */
  lastmod?: string;
  /** true si tiene manhwa Y novela: es el contenido que solo este sitio arma. */
  ambos: boolean;
}

export async function metaSitemap(): Promise<Map<string, MetaObra>> {
  const mapa = new Map<string, MetaObra>();
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return mapa;

  const db = createClient(url, key, { auth: { persistSession: false } });
  const tipos = new Map<string, Set<string>>();
  const TAM = 1000;
  try {
    for (let desde = 0; ; desde += TAM) {
      const { data, error } = await db
        .from('fuentes')
        .select('obra_slug, tipo, ultimo_cambio, ultimo_scrape')
        .range(desde, desde + TAM - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const f of data as any[]) {
        const cur = mapa.get(f.obra_slug) ?? { ambos: false };
        const fecha = f.ultimo_cambio || f.ultimo_scrape;
        if (fecha && (!cur.lastmod || fecha > cur.lastmod)) cur.lastmod = fecha;
        mapa.set(f.obra_slug, cur);
        (tipos.get(f.obra_slug) ?? tipos.set(f.obra_slug, new Set()).get(f.obra_slug)!).add(f.tipo);
      }
      if (data.length < TAM) break;
    }
    for (const [slug, set] of tipos) mapa.get(slug)!.ambos = set.size >= 2;
  } catch (e) {
    console.warn(`[sitemapMeta] ${(e as Error).message} — sitemap con valores por defecto`);
  }
  return mapa;
}
