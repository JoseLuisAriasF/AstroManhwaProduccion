/**
 * Indexa capítulos nuevos de las fuentes registradas en la tabla `fuentes`.
 *
 * Guarda SOLO metadata (título, número, fecha) y el enlace a la fuente original.
 * No descarga ni almacena el texto de los capítulos ni las páginas del manhwa:
 * el lector va al sitio de origen. Eso es lo que hace legal al agregador.
 *
 * Las fuentes las crea `descubrir.mjs` a partir de `sitios`, o se insertan a
 * mano. Cada fuente lleva su idioma y su tipo (manhwa/novela), así que la misma
 * obra puede tener 200 capítulos en inglés y 80 en español, cada uno en su lista.
 *
 *   node --env-file-if-exists=.env scripts/scrapear.mjs
 *   node --env-file-if-exists=.env scripts/scrapear.mjs --obra=slug   # una sola
 *
 * Necesita SUPABASE_SERVICE_KEY (Settings → API → service_role). Nunca la
 * pongas en PUBLIC_* ni la subas al repo: salta RLS.
 */
import { createClient } from '@supabase/supabase-js';
import { PLATAFORMAS, espera, numeroDe, utiles } from './plataformas.mjs';

export { numeroDe };

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const limpio = a.replace(/^--/, '');
    const i = limpio.indexOf('=');
    return i === -1 ? [limpio, 'true'] : [limpio.slice(0, i), limpio.slice(i + 1)];
  }),
);

const CORTESIA = 1500; // ms entre páginas del mismo sitio

export async function scrapearFuente(db, f) {
  const adaptador = PLATAFORMAS[f.plataforma ?? 'css'];
  if (!adaptador) throw new Error(`plataforma desconocida: ${f.plataforma}`);

  // Las fuentes descubiertas apuntan a la página de la serie, que ya trae su
  // índice completo. Las escritas a mano pueden paginar con {page}.
  const paginado = f.url_listado.includes('{page}');
  const techo = paginado ? f.paginas : 1;

  const encontrados = [];
  const vistos = new Set();
  for (let p = 1; p <= techo; p++) {
    const url = f.url_listado.replace('{page}', String(p));
    let items;
    try {
      items = utiles(await adaptador.capitulos(url, f));
    } catch (e) {
      console.log(`  página ${p} → ${e.message}, se detiene aquí`);
      break;
    }
    const nuevos = items.filter(
      (i) =>
        !vistos.has(i.url) &&
        // Descarta spinoffs, side stories y anuncios cuando la fuente lo pide.
        (!f.titulo_prefijo || i.titulo.startsWith(f.titulo_prefijo)),
    );
    items.forEach((i) => vistos.add(i.url));
    encontrados.push(
      ...nuevos.map((i) => ({
        fuente_id: f.id,
        obra_slug: f.obra_slug,
        numero: i.numero,
        titulo: i.titulo,
        url: i.url,
        fecha_texto: i.fecha_texto,
        idioma: f.idioma ?? 'es',
        tipo: f.tipo ?? 'novela',
        aprobado: true, // publicable por defecto; el admin desmarca lo que no quiera
      })),
    );
    if (nuevos.length === 0) break;
    if (!paginado) break;
    await espera(CORTESIA);
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
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Con cientos de obras no caben todas las fuentes en una corrida (1,5 s de
  // cortesía cada una). Se atiende primero a las que llevan más tiempo sin
  // revisar y el resto entra mañana: en unos días la rueda pasa por todas.
  // Las nuevas (ultimo_scrape null) van delante, que son las que no tienen nada.
  const max = Number(args.max) || 400;
  let q = db
    .from('fuentes')
    .select('*')
    .eq('activa', true)
    .order('ultimo_scrape', { ascending: true, nullsFirst: true })
    .limit(max);
  if (args.obra) q = q.eq('obra_slug', args.obra);
  const { data: fuentes, error } = await q;
  if (error) throw new Error(error.message);

  let total = 0;
  for (const f of fuentes ?? []) {
    console.log(`→ ${f.nombre} · ${f.obra_slug} · ${f.tipo}/${f.idioma}`);
    try {
      const n = await scrapearFuente(db, f);
      total += n;
      console.log(`  ${n} capítulos vistos`);
    } catch (e) {
      console.error(`  falló: ${e.message}`); // una fuente rota no tumba el resto
    }
    await espera(CORTESIA);
  }
  console.log(`\n${total} capítulos en ${fuentes?.length ?? 0} fuentes`);
}
