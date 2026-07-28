/**
 * Indexa capítulos nuevos de las fuentes registradas en la tabla `fuentes`.
 *
 * Guarda SOLO metadata (título, número, fecha) y el enlace a la fuente original.
 * No descarga ni almacena el texto de los capítulos: el lector va al sitio de
 * origen. Eso es lo que hace legal al agregador.
 *
 *   node --env-file-if-exists=.env scripts/scrapear.mjs
 *
 * Necesita SUPABASE_SERVICE_KEY (Settings → API → service_role). Nunca la
 * pongas en PUBLIC_* ni la subas al repo: salta RLS.
 */
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

let db; // se crea solo al ejecutar; importar este módulo no exige credenciales

const UA = 'ManhwaToNovelBot/1.0 (+https://www.manhwatonovel.com/bot)';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** "Capítulo 128 – Título" → 128. null si no hay número reconocible. */
export function numeroDe(titulo) {
  const m = titulo.match(/(?:cap[íi]tulo|chapter|cap|ch)\.?\s*#?\s*(\d{1,5})/i) ?? titulo.match(/\b(\d{1,5})\b/);
  return m ? Number(m[1]) : null;
}

async function scrapearFuente(f) {
  const encontrados = [];
  for (let p = 1; p <= f.paginas; p++) {
    const pagina = f.url_listado.replace('{page}', String(p));
    const res = await fetch(pagina, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.warn(`  ${pagina} → HTTP ${res.status}, se detiene esta fuente`);
      break;
    }
    const $ = cheerio.load(await res.text());
    $(f.sel_item).each((_, el) => {
      const item = $(el);
      const titulo = item.find(f.sel_titulo).first().text().trim();
      const href = item.find(f.sel_enlace).first().attr('href');
      if (!titulo || !href) return;
      encontrados.push({
        fuente_id: f.id,
        novela_slug: f.novela_slug,
        numero: numeroDe(titulo),
        titulo,
        url: new URL(href, pagina).href,
        fecha_texto: f.sel_fecha ? item.find(f.sel_fecha).first().text().trim() || null : null,
      });
    });
    await espera(2000); // cortesía con el servidor de origen
  }

  if (encontrados.length) {
    // onConflict sobre (fuente_id, url): re-scrapear no duplica ni pisa `aprobado`.
    const { error } = await db
      .from('capitulos_externos')
      .upsert(encontrados, { onConflict: 'fuente_id,url', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  await db.from('fuentes').update({ ultimo_scrape: new Date().toISOString() }).eq('id', f.id);
  return encontrados.length;
}

if (import.meta.main) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Faltan PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  db = createClient(url, key, { auth: { persistSession: false } });

  const { data: fuentes, error } = await db.from('fuentes').select('*').eq('activa', true);
  if (error) throw new Error(error.message);

  for (const f of fuentes ?? []) {
    console.log(`→ ${f.nombre} (${f.novela_slug})`);
    try {
      console.log(`  ${await scrapearFuente(f)} capítulos vistos`);
    } catch (e) {
      console.error(`  falló: ${e.message}`); // una fuente rota no tumba el resto
    }
  }
}
