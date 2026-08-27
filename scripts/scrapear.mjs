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
import { PLATAFORMAS, esEnlace, espera, numeroDe, utiles } from './plataformas.mjs';

export { numeroDe };

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const limpio = a.replace(/^--/, '');
    const i = limpio.indexOf('=');
    return i === -1 ? [limpio, 'true'] : [limpio.slice(0, i), limpio.slice(i + 1)];
  }),
);

const CORTESIA = 1500; // ms entre peticiones al MISMO dominio (raspado de HTML)
// APIs y feeds toleran más ritmo que raspar HTML frágil; no hace falta 1,5 s.
const CORTESIA_PLATAFORMA = { mangadex: 300, blogger: 300 };
const cortesiaDe = (f) => CORTESIA_PLATAFORMA[f.plataforma] ?? CORTESIA;

/** Corre `tarea` sobre `items` con hasta `n` en paralelo. */
async function poza(items, n, tarea) {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await tarea(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

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
        // La columna es int y el ".5" existe (272.5, 113.5). Se trunca aquí,
        // donde convergen todos los adaptadores, en vez de en cada uno: el
        // título conserva el "272.5" visible y el número queda en 272.
        numero: Number.isFinite(i.numero) ? Math.trunc(i.numero) : null,
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

  // Se atienden primero las que llevan más tiempo sin revisar; las nuevas
  // (ultimo_scrape null) van delante, que son las que no tienen nada.
  // Supabase corta cada request en 1000 filas, así que se pagina hasta juntar
  // `max`. Sin esto, --max mayor a 1000 no traía más y la cola no se vaciaba.
  const max = Number(args.max) || 400;
  const fuentes = [];
  for (let desde = 0; fuentes.length < max; desde += 1000) {
    let q = db
      .from('fuentes')
      .select('*')
      .eq('activa', true)
      .order('ultimo_scrape', { ascending: true, nullsFirst: true })
      .range(desde, desde + 999);
    if (args.obra) q = q.eq('obra_slug', args.obra);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    fuentes.push(...data);
    if (data.length < 1000) break;
  }
  fuentes.length = Math.min(fuentes.length, max);

  const dominioDe = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  };

  let total = 0;
  let hechas = 0;
  const hacer = async (f) => {
    console.log(`→ ${f.nombre} · ${f.obra_slug} · ${f.tipo}/${f.idioma}`);
    try {
      total += await scrapearFuente(db, f);
    } catch (e) {
      console.error(`  falló: ${e.message}`); // una fuente rota no tumba el resto
    }
    hechas++;
  };

  // Fase 1: link-out (olympus, manhwaweb). No hacen NI una petición HTTP —
  // capitulosEnlace solo lee el #caps= de la URL—, así que no llevan cortesía y
  // van en paralelo; el único límite es escribir en Supabase. Antes dormían
  // 1,5 s cada una: ~6.000 fuentes = 2,5 h tiradas sin tocar ningún sitio.
  const enlace = fuentes.filter((f) => esEnlace(f.plataforma));
  await poza(enlace, 24, hacer);

  // Fase 2: las que sí piden red. Cortesía POR DOMINIO (cada sitio en serie con
  // su pausa), varios dominios a la vez. La pausa depende de la plataforma: 1,5 s
  // para raspar HTML, 300 ms para APIs/feeds (mangadex, blogger) que lo toleran.
  const colas = new Map();
  for (const f of fuentes) {
    if (esEnlace(f.plataforma)) continue;
    const d = dominioDe(f.url_listado);
    (colas.get(d) ?? colas.set(d, []).get(d)).push(f);
  }
  await poza([...colas.values()], 12, async (cola) => {
    for (const f of cola) {
      await hacer(f);
      await espera(cortesiaDe(f));
    }
  });

  console.log(`\n${total} capítulos en ${hechas} fuentes · ${enlace.length} link-out + ${colas.size} dominios`);
}
