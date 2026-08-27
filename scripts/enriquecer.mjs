/**
 * Enriquece la metadata de las obras (sinopsis, títulos alternos, géneros,
 * estado) desde bases de datos de fichas: AniList, MangaUpdates, MangaBaka y
 * MyAnimeList. Cada obra se enriquece UNA vez (columna `enriquecida`); en las
 * corridas siguientes solo entran las nuevas.
 *
 *   node --env-file-if-exists=.env scripts/enriquecer.mjs
 *   node ... scripts/enriquecer.mjs --max=2000 --obra=slug
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
import { normalizar } from './emparejar.mjs';
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

/** ¿Alguno de los títulos del resultado coincide (normalizado) con la obra? */
function casa(nombresObra, res) {
  const set = new Set(nombresObra.map(normalizar));
  return res.titulos.some((t) => set.has(normalizar(t)));
}

/** Busca en la cascada la primera fuente que casa con la obra. */
export async function enriquecerObra(obra) {
  const nombres = [obra.titulo, ...(obra.titulos_alternativos ?? [])].filter(Boolean);
  for (const fuente of ORDEN) {
    let res;
    try {
      res = await FUENTES[fuente](obra.titulo);
    } catch (e) {
      res = null; // una fuente caída (p.ej. Jikan 504) no rompe la cascada
    }
    await espera(CORTESIA[fuente]);
    if (res && casa(nombres, res)) return { fuente, ...res };
  }
  return null;
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
  // Solo las que faltan por enriquecer (las nuevas van primero, con id estable).
  let q = db
    .from('obras')
    .select('slug,titulo,titulos_alternativos,sinopsis,categorias,estado')
    .eq('enriquecida', false)
    .limit(max);
  if (args.obra) q = db
    .from('obras')
    .select('slug,titulo,titulos_alternativos,sinopsis,categorias,estado')
    .eq('slug', args.obra);
  const { data: obras, error } = await q;
  if (error) throw new Error(error.message);

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
