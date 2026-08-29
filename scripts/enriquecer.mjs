/**
 * Enriquece la metadata de las obras (sinopsis, títulos alternos, géneros,
 * estado) desde bases de datos de fichas: AniList, MangaUpdates, MangaBaka y
 * MyAnimeList. Cada obra se enriquece UNA vez (columna `enriquecida`); en las
 * corridas siguientes solo entran las nuevas.
 *
 *   node --env-file-if-exists=.env scripts/enriquecer.mjs
 *   node ... scripts/enriquecer.mjs --max=2000 --obra=slug
 *   node ... scripts/enriquecer.mjs --reintentar   # las que quedaron sin match
 *
 * La coincidencia es conservadora (igual que emparejar): se acepta un resultado
 * solo si alguno de SUS títulos normalizados coincide con el de la obra o con
 * uno de sus alternos. Un falso match metería la descripción equivocada.
 *
 * La sinopsis viene en inglés; se guarda tal cual como texto ORIGEN para que
 * LibreTranslate la traduzca a futuro (por eso `idiomasDeObra` no publica una
 * obra en otros idiomas hasta que su sinopsis esté de verdad traducida).
 *
 * Necesita SUPABASE_SERVICE_KEY (salta RLS). Solo en GitHub Secrets.
 */
import { createClient } from '@supabase/supabase-js';
import { clavesDe, normalizar } from './emparejar.mjs';
import { espera } from './plataformas.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const l = a.replace(/^--/, '');
    const i = l.indexOf('=');
    return i === -1 ? [l, 'true'] : [l.slice(0, i), l.slice(i + 1)];
  }),
);

const UA = 'ManhwaToNovelBot/1.0 (+https://www.manhwatonovel.com/bot)';

const limpiarHtml = (s) =>
  String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const estadoDe = (raw) => {
  const r = String(raw ?? '').toLowerCase();
  if (/finish|complet|finalizad/.test(r)) return 'Finalizado';
  if (/ongoing|releasing|emis|publish|hiatus/.test(r)) return 'En emisión';
  return null;
};

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Cada fuente: (query) → { titulos[], sinopsis, generos[], estado } | null.
const FUENTES = {
  async anilist(q) {
    const j = await fetchJson('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($s:String){Media(search:$s,type:MANGA){title{romaji english native} synonyms genres status description(asHtml:false)}}',
        variables: { s: q },
      }),
    });
    const m = j?.data?.Media;
    if (!m) return null;
    return {
      titulos: [m.title?.romaji, m.title?.english, m.title?.native, ...(m.synonyms ?? [])].filter(Boolean),
      sinopsis: limpiarHtml(m.description),
      generos: m.genres ?? [],
      estado: estadoDe(m.status),
    };
  },

  async mangaupdates(q) {
    const s = await fetchJson('https://api.mangaupdates.com/v1/series/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: q, perpage: 1 }),
    });
    const id = s?.results?.[0]?.record?.series_id;
    if (!id) return null;
    const r = await fetchJson(`https://api.mangaupdates.com/v1/series/${id}`);
    return {
      titulos: [r.title, ...(r.associated ?? []).map((a) => a.title)].filter(Boolean),
      sinopsis: limpiarHtml(r.description),
      generos: (r.genres ?? []).map((g) => g.genre).filter(Boolean),
      estado: estadoDe(r.status),
    };
  },

  async mangabaka(q) {
    const s = await fetchJson(`https://api.mangabaka.org/v1/series/search?q=${encodeURIComponent(q)}`);
    const d = s?.data?.[0];
    if (!d) return null;
    const sec = Object.values(d.secondary_titles ?? {})
      .flat()
      .map((x) => x?.title)
      .filter(Boolean);
    return {
      titulos: [d.title, d.native_title, d.romanized_title, ...sec].filter(Boolean),
      sinopsis: limpiarHtml(d.description),
      generos: (d.genres ?? []).map((g) => g?.name ?? g).filter(Boolean),
      estado: estadoDe(d.status),
    };
  },

  async mal(q) {
    const j = await fetchJson(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(q)}&limit=1`);
    const m = j?.data?.[0];
    if (!m) return null;
    return {
      titulos: [m.title, ...(m.titles ?? []).map((t) => t.title)].filter(Boolean),
      sinopsis: limpiarHtml(m.synopsis),
      generos: (m.genres ?? []).map((g) => g.name).filter(Boolean),
      estado: estadoDe(m.status),
    };
  },
};

// Orden de la cascada: primero las más fiables. Se para en el primer match.
const ORDEN = ['anilist', 'mangaupdates', 'mangabaka', 'mal'];
const CORTESIA = { anilist: 700, mangaupdates: 1100, mangabaka: 700, mal: 1300 };

/**
 * ¿Alguno de los títulos del resultado coincide con la obra? Se comparan las
 * mismas claves que usa el emparejado (sin artículo, sin sufijo de tipo y con
 * las palabras ordenadas), no el texto crudo: una obra descubierta en Olympus
 * como "El Lancero Genio Inmortal" casa así con "El genio lancero inmortal" de
 * MangaBaka, y se lleva de vuelta sus títulos en inglés y coreano — que son los
 * que luego enganchan la novela de DaoTranslate con este mismo manhwa.
 */
function casa(nombresObra, res) {
  const set = new Set(nombresObra.flatMap(clavesDe));
  return res.titulos.some((t) => clavesDe(t).some((c) => set.has(c)));
}

/**
 * Traduce al inglés (MyMemory, gratis y sin clave). El catálogo en español de
 * Olympus no está indexado por su título en NINGUNA base de fichas: "Emperador
 * Mágico" no encuentra nada, pero "Magic Emperor" sí. Sin esto, todo el catálogo
 * español se queda sin sinopsis, sin géneros y —lo que importa para el puente—
 * sin los títulos en inglés/chino que enganchan su novela (DaoTranslate, WTR).
 * Devuelve null si no cambia nada (título ya en inglés) o si la API falla.
 */
async function aIngles(texto) {
  try {
    const j = await fetchJson(
      `https://api.mymemory.translated.net/get?langpair=es|en&q=${encodeURIComponent(texto)}`,
    );
    const t = j?.responseData?.translatedText?.trim();
    return t && normalizar(t) !== normalizar(texto) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Enriquece una obra desde las bases de fichas. Dos cosas la hacen cruzar
 * idiomas —que es de lo que vive el sitio—:
 *
 *  1. Si el título (en español) no casa con nada, se reintenta con su
 *     TRADUCCIÓN al inglés. Así "Emperador Mágico" llega a "Magic Emperor" y de
 *     ahí a la ficha real.
 *  2. Los títulos alternativos se FUSIONAN de todas las fuentes que casan, no
 *     solo de la primera. Una base trae el nombre en inglés, otra el coreano,
 *     otra "The Steward Demonic Emperor"… y son justo esos nombres los que
 *     luego enganchan la novela de WTR/DaoTranslate con este manhwa. La
 *     sinopsis, los géneros y el estado sí salen de la PRIMERA que casa (la más
 *     fiable), para no mezclar descripciones.
 */
export async function enriquecerObra(obra) {
  const nombres = [obra.titulo, ...(obra.titulos_alternativos ?? [])].filter(Boolean);

  /** Recorre las cuatro bases con una consulta; junta base + todos los alternos.
   *  `extra` son nombres que también valen para el match (p.ej. la traducción). */
  const barrer = async (query, extra = []) => {
    const validos = [...nombres, ...extra];
    let base = null;
    const alt = new Set();
    for (const fuente of ORDEN) {
      let res;
      try {
        res = await FUENTES[fuente](query);
      } catch {
        res = null; // una fuente caída (p.ej. Jikan 504) no rompe la cascada
      }
      await espera(CORTESIA[fuente]);
      if (res && casa(validos, res)) {
        base ??= { fuente, ...res }; // la primera manda para sinopsis/géneros
        for (const t of res.titulos) alt.add(t);
      }
    }
    return base ? { ...base, titulos: [...new Set([...base.titulos, ...alt])] } : null;
  };

  const directo = await barrer(obra.titulo);
  if (directo) return directo;

  // Nada por el título tal cual: se traduce al inglés y se reintenta. La
  // traducción entra como nombre válido para el match (es el nombre por el que
  // la obra existe en las bases en inglés).
  const tr = await aIngles(obra.titulo);
  return tr ? barrer(tr, [tr]) : null;
}

/** El parche para Supabase: rellena vacíos y fusiona alternos; nunca pisa datos. */
export function parcheDe(obra, res) {
  const parche = { enriquecida: true };
  if (!res) return parche;
  parche.metadatos_fuente = res.fuente;
  if (!obra.sinopsis?.trim() && res.sinopsis) parche.sinopsis = res.sinopsis.slice(0, 4000);
  if (!obra.categorias?.length && res.generos.length) parche.categorias = res.generos.slice(0, 8);
  if (!obra.estado && res.estado) parche.estado = res.estado;
  const alt = new Set([...(obra.titulos_alternativos ?? []), ...res.titulos].filter(Boolean));
  alt.delete(obra.titulo);
  if (alt.size) parche.titulos_alternativos = [...alt].slice(0, 15);
  return parche;
}

if (import.meta.main) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Faltan PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const max = Number(args.max) || 2000;
  const cols = 'slug,titulo,titulos_alternativos,sinopsis,categorias,estado';

  // Solo las que faltan por enriquecer. Supabase corta cada request en 1000
  // filas, así que se pagina hasta juntar `max` (sin esto --max>1000 no traía
  // más y había que re-correr una y otra vez).
  let obras = [];
  if (args.obra) {
    const { data, error } = await db.from('obras').select(cols).eq('slug', args.obra);
    if (error) throw new Error(error.message);
    obras = data ?? [];
  } else {
    for (let desde = 0; obras.length < max; desde += 1000) {
      // --reintentar: las que YA se enriquecieron pero no casaron con ninguna
      // ficha (metadatos_fuente vacío). Sin esto, un fallo de emparejado quedaba
      // congelado para siempre —`enriquecida` se marca aunque no haya match—.
      let q = db.from('obras').select(cols).range(desde, desde + 999);
      q = args.reintentar
        ? q.eq('enriquecida', true).is('metadatos_fuente', null)
        : q.eq('enriquecida', false);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      obras.push(...data);
      if (data.length < 1000) break;
    }
    obras = obras.slice(0, max);
  }

  let casadas = 0;
  for (const obra of obras ?? []) {
    const res = await enriquecerObra(obra);
    const parche = parcheDe(obra, res);
    const { error: e } = await db.from('obras').update(parche).eq('slug', obra.slug);
    if (e) {
      console.error(`  ${obra.slug}: ${e.message}`);
      continue;
    }
    if (res) casadas++;
    console.log(`${res ? '✓ ' + res.fuente : '·  sin match'}  ${obra.titulo}`);
  }
  console.log(`\n${casadas}/${obras?.length ?? 0} obras enriquecidas`);
}
