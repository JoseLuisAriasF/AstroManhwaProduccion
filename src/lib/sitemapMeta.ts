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
  /** true si alguna fuente vio portada: entonces `/portada/<slug>.jpg` devuelve
   *  una imagen de verdad y vale la pena declararla en el sitemap de imagen. */
  portada: boolean;
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
        .select('obra_slug, tipo, ultimo_cambio, ultimo_scrape, portada_vista')
        // Orden total, o `range()` se salta filas: ver el aviso en api.ts.
        .order('id')
        .range(desde, desde + TAM - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const f of data as any[]) {
        const cur = mapa.get(f.obra_slug) ?? { ambos: false, portada: false };
        const fecha = f.ultimo_cambio || f.ultimo_scrape;
        if (fecha && (!cur.lastmod || fecha > cur.lastmod)) cur.lastmod = fecha;
        if (f.portada_vista) cur.portada = true;
        mapa.set(f.obra_slug, cur);
        (tipos.get(f.obra_slug) ?? tipos.set(f.obra_slug, new Set()).get(f.obra_slug)!).add(f.tipo);
      }
      if (data.length < TAM) break;
    }
    for (const [slug, set] of tipos) mapa.get(slug)!.ambos = set.size >= 2;

    // La portada del admin vive en `obras.portada_url` y puede no estar en
    // ninguna fuente: medido, 477 obras del catálogo tienen imagen SOLO ahí y
    // se quedaban fuera del sitemap de imagen aunque `/portada/<slug>.jpg` las
    // sirva perfectamente.
    for (let desde = 0; ; desde += TAM) {
      const { data, error } = await db
        .from('obras')
        .select('slug, portada_url')
        .order('slug')
        .range(desde, desde + TAM - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const o of data as any[]) {
        if (!/^https?:\/\//.test(o.portada_url ?? '')) continue;
        const cur = mapa.get(o.slug);
        if (cur) cur.portada = true;
      }
      if (data.length < TAM) break;
    }
  } catch (e) {
    console.warn(`[sitemapMeta] ${(e as Error).message} — sitemap con valores por defecto`);
  }
  return mapa;
}
