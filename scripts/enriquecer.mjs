/**
 * Enriquece la metadata de las obras (sinopsis, títulos alternos, géneros,
 * estado) desde bases de datos de fichas: AniList, MangaUpdates, MangaBaka y
 * MyAnimeList. Cada obra se enriquece UNA vez (columna `enriquecida`); en las
 * corridas siguientes solo entran las nuevas.
 *
 *   node --env-file-if-exists=.env scripts/enriquecer.mjs
 *   node ... scripts/enriquecer.mjs --max=2000 --obra=slug
 *   node ... scripts/enriquecer.mjs --reintentar   # las que quedaron sin match
 *   node ... scripts/enriquecer.mjs --nivel-a      # obras A sin sinopsis o con portada muerta
 *   node ... scripts/enriquecer.mjs --sin-portada  # TODAS las obras cuya portada no carga
 *   node ... scripts/enriquecer.mjs --demografia   # Shounen/Seinen/… deducido de los géneros, sin red
 *   node ... scripts/enriquecer.mjs --categorias   # fusiona los géneros de TODAS las bases (Isekai, Murim…)
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
import { limpiarSinopsis } from '../src/lib/sinopsis.ts';
import { esRetirada } from '../src/lib/dmca.ts';
import { claveGenero, esGeneroConocido, fusionarGeneros } from '../src/lib/generos.ts';

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

/**
 * Demografía (Shounen, Seinen, Shoujo, Josei): es la categoría por la que más se
 * navega en los sitios de manhwa y casi ninguna scan la pone. AniList la trae en
 * `tags`, MangaUpdates en `genres` y MAL en `demographics`.
 */
const DEMOGRAFIAS = ['Shounen', 'Seinen', 'Shoujo', 'Josei'];
const letras = (e) =>
  String(e ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/^shonen$/, 'shounen')
    .replace(/^shojo$/, 'shoujo');
export const demografiaDe = (etiquetas = []) =>
  DEMOGRAFIAS.find((d) => etiquetas.some((e) => letras(e) === d.toLowerCase())) ?? null;

/**
 * Cuando ninguna base la da: se deduce de los géneros que ya tiene la obra.
 * ponytail: heurística por géneros, acierta lo típico (acción → shounen,
 * romance sin acción → shoujo, adulto → seinen); si una obra sale mal
 * etiquetada, la corrige el admin o el enriquecido con datos de AniList.
 */
const ADULTOS = new Set(['adulto', 'smut', 'hentai', 'erotico', 'maduro', 'ecchi', 'harem', 'psicologico', 'terror']);
const ACCION = new Set([
  'accion', 'artes-marciales', 'aventura', 'fantasia', 'murim', 'wuxia', 'regresion', 'torres',
  'videojuegos', 'deportes', 'superheroes', 'mecha', 'isekai', 'reencarnacion', 'demonios', 'venganza',
]);
const ROMANCE = new Set(['romance', 'drama', 'recuentos-de-la-vida', 'vida-escolar', 'historico']);
export function demografiaPorGeneros(categorias = []) {
  const claves = categorias.map(claveGenero);
  const hay = (set) => claves.some((c) => set.has(c));
  if (hay(ADULTOS)) return 'Seinen';
  if (hay(ACCION)) return 'Shounen';
  if (hay(ROMANCE)) return 'Shoujo';
  return null;
}

// Cada fuente: (query) → { titulos[], sinopsis, generos[], estado, portada? } | null.
// `portada` sale de las bases que la sirven sin bloquear el hotlinking (su CDN
// la entrega a nuestro proxy de /portada/): AniList, MangaUpdates y MAL.
const FUENTES = {
  async anilist(q) {
    const j = await fetchJson('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($s:String){Media(search:$s,type:MANGA){title{romaji english native} synonyms genres tags{name rank isMediaSpoiler} status description(asHtml:false) coverImage{extraLarge}}}',
        variables: { s: q },
      }),
    });
    const m = j?.data?.Media;
    if (!m) return null;
    return {
      titulos: [m.title?.romaji, m.title?.english, m.title?.native, ...(m.synonyms ?? [])].filter(Boolean),
      sinopsis: limpiarHtml(m.description),
      generos: m.genres ?? [],
      etiquetas: (m.tags ?? []).filter((t) => !t.isMediaSpoiler && t.rank >= 60).map((t) => t.name),
      demografia: demografiaDe((m.tags ?? []).map((t) => t.name)),
      estado: estadoDe(m.status),
      portada: m.coverImage?.extraLarge ?? null,
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
      etiquetas: (r.categories ?? [])
        .filter((c) => c.votes > 0)
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 25)
        .map((c) => c.category),
      demografia: demografiaDe((r.genres ?? []).map((g) => g.genre)),
      estado: estadoDe(r.status),
      portada: r.image?.url?.original ?? null,
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
      etiquetas: (m.themes ?? []).map((g) => g.name),
      demografia: demografiaDe((m.demographics ?? []).map((g) => g.name)),
      estado: estadoDe(m.status),
      portada: m.images?.jpg?.large_image_url ?? null,
    };
  },
};

/** Los géneros de un resultado: los suyos + los tags/temas que son género de
 *  verdad (esGeneroConocido). «Male Protagonist» o «Full Color» no entran. */
export const generosDe = (res) => [...(res?.generos ?? []), ...(res?.etiquetas ?? []).filter(esGeneroConocido)];

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
 *  2. Los títulos alternativos se completan con MangaBaka, que es la base con
 *     los nombres en más idiomas (inglés, coreano, "The Steward Demonic
 *     Emperor"…) — justo los que enganchan la novela de WTR/DaoTranslate con
 *     este manhwa. La sinopsis, los géneros y el estado salen de la PRIMERA que
 *     casa (la más fiable); MangaBaka solo aporta nombres.
 *
 * Para en la primera que casa y consulta MangaBaka una vez: ~2 bases por obra,
 * no las 4. Consultarlas todas costaba ~5× y hacía que el workflow nocturno se
 * pasara del límite de tiempo. Con esto vuelve a caber.
 */
export async function enriquecerObra(obra, { todas = false } = {}) {
  const nombres = [obra.titulo, ...(obra.titulos_alternativos ?? [])].filter(Boolean);

  /** Consulta las bases: PARA en la primera que casa (sinopsis/géneros/estado) y
   *  suma los nombres de MangaBaka para el emparejado cruzado. `extra` son
   *  nombres que también valen para el match (p.ej. la traducción al inglés). */
  const barrer = async (query, extra = []) => {
    const validos = [...nombres, ...extra];
    let base = null;
    // Con `todas`, no se para en la primera: cada base que casa suma sus
    // géneros, títulos y demografía. La sinopsis/portada siguen siendo de la
    // primera (la más fiable).
    const suma = { generos: [], titulos: [], demografia: null, fuentes: [] };
    const consultar = async (fuente) => {
      let res;
      try {
        res = await FUENTES[fuente](query);
      } catch {
        res = null; // una fuente caída (p.ej. Jikan 504) no rompe la cascada
      }
      await espera(CORTESIA[fuente]);
      return res;
    };
    // Con `todas` se preguntan las cuatro A LA VEZ: cada base tiene su propio
    // límite, así que en serie se esperaba la suma de las cuatro cortesías por
    // obra (~8 s) para nada. En paralelo es la más lenta (~2-3 s).
    const respuestas = todas ? await Promise.all(ORDEN.map(consultar)) : null;
    for (const [i, fuente] of ORDEN.entries()) {
      const res = respuestas ? respuestas[i] : await consultar(fuente);
      if (res && casa(validos, res)) {
        base ??= { fuente, ...res };
        suma.generos.push(...generosDe(res));
        suma.titulos.push(...res.titulos);
        suma.demografia ??= res.demografia ?? null;
        suma.fuentes.push(fuente);
        if (!todas) break;
      }
    }
    if (!base) return null;
    base = {
      ...base,
      generos: fusionarGeneros([suma.generos], 30),
      etiquetas: [],
      titulos: [...new Set(suma.titulos)],
      demografia: base.demografia ?? suma.demografia,
      fuente: suma.fuentes.join('+'),
    };

    // MangaBaka trae los nombres en más idiomas; se suma para el match cruzado.
    // Si ya fue la base, no se repite.
    const titulos = new Set(base.titulos);
    if (!todas && !base.fuente.includes('mangabaka')) {
      try {
        const mb = await FUENTES.mangabaka(query);
        await espera(CORTESIA.mangabaka);
        if (mb && casa(validos, mb)) for (const t of mb.titulos) titulos.add(t);
      } catch {
        /* MangaBaka caída: nos quedamos con los nombres de la base */
      }
    }
    return { ...base, titulos: [...titulos] };
  };

  const directo = await barrer(obra.titulo);
  if (directo) return directo;

  // Nada por el título tal cual: se traduce al inglés y se reintenta. La
  // traducción entra como nombre válido para el match (es el nombre por el que
  // la obra existe en las bases en inglés).
  const tr = await aIngles(obra.titulo);
  return tr ? barrer(tr, [tr]) : null;
}

/** Hosts de portada que ya no sirven: imageshack está muerto (404) y MangaDex
 *  devuelve un cartel en vez de la imagen al que la pide desde fuera. */
export const PORTADA_MUERTA = /imageshack|mangadex/i;

/** El parche para Supabase: rellena vacíos y fusiona alternos; nunca pisa datos
 *  buenos (una portada en un host muerto no cuenta como dato). */
export function parcheDe(obra, res) {
  const parche = { enriquecida: true };
  // La demografía se añade SIEMPRE que falte (aunque la obra ya tenga géneros):
  // primero la de la base de fichas, si no la deducida de sus géneros.
  const conDemografia = (cats) => {
    if (demografiaDe(cats)) return null;
    const d = res?.demografia ?? demografiaPorGeneros(cats);
    return d ? [...cats, d] : null;
  };
  if (!res) {
    const cats = conDemografia(obra.categorias ?? []);
    if (cats) parche.categorias = cats;
    return parche;
  }
  parche.metadatos_fuente = res.fuente;
  const sinopsis = limpiarSinopsis(res.sinopsis);
  if (!obra.sinopsis?.trim() && sinopsis) parche.sinopsis = sinopsis.slice(0, 4000);
  // Los géneros se FUSIONAN: lo que trajo la scan + lo de cada base de fichas.
  // Antes solo se rellenaba si estaba vacío, y la obra se quedaba con los 2-3
  // géneros de la primera scan (sin Isekai, Regresión, Murim…).
  const antes = obra.categorias ?? [];
  const unidas = fusionarGeneros([antes, generosDe(res)]);
  const cats = conDemografia(unidas) ?? unidas;
  if (cats.length !== antes.length) parche.categorias = cats;
  if (!obra.estado && res.estado) parche.estado = res.estado;
  if (res.portada && (!obra.portada_url || PORTADA_MUERTA.test(obra.portada_url))) parche.portada_url = res.portada;
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
  const cols = 'slug,titulo,titulos_alternativos,sinopsis,categorias,estado,portada_url';

  // Solo las que faltan por enriquecer. Supabase corta cada request en 1000
  // filas, así que se pagina hasta juntar `max` (sin esto --max>1000 no traía
  // más y había que re-correr una y otra vez).
  let obras = [];
  if (args.obra) {
    const { data, error } = await db.from('obras').select(cols).eq('slug', args.obra);
    if (error) throw new Error(error.message);
    obras = data ?? [];
  } else if (args.categorias) {
    // Fusiona los géneros de TODAS las bases de fichas en las obras que ya
    // casaron alguna vez (las que nunca casaron volverían a fallar). Lento
    // (~4 bases por obra): se marca `categorias_fusionadas` y cada corrida
    // sigue donde lo dejó la anterior.
    for (let desde = 0; obras.length < max; desde += 1000) {
      const { data, error } = await db
        .from('obras')
        .select(cols)
        .eq('categorias_fusionadas', false)
        .not('metadatos_fuente', 'is', null)
        .order('slug')
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      obras.push(...data);
      if (data.length < 1000) break;
    }
    obras = obras.slice(0, max);
    console.log(`${obras.length} obras para fusionar géneros de todas las bases`);
  } else if (args.demografia) {
    // Solo la demografía, sin consultar ninguna base: deducida de los géneros.
    // Una pasada sobre el catálogo entero. Las obras nuevas la reciben de
    // AniList/MangaUpdates/MAL en el enriquecido nocturno.
    let n = 0;
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db.from('obras').select('slug,categorias').order('slug').range(desde, desde + 999);
      if (error) throw new Error(error.message);
      for (const o of data) {
        const cats = o.categorias ?? [];
        const d = !demografiaDe(cats) && demografiaPorGeneros(cats);
        if (!d) continue;
        const { error: e } = await db.from('obras').update({ categorias: [...cats, d] }).eq('slug', o.slug);
        if (e) console.error(`  ${o.slug}: ${e.message}`);
        else n++;
      }
      if (data.length < 1000) break;
    }
    console.log(`${n} obras con demografía nueva`);
    process.exit(0);
  } else if (args['sin-portada']) {
    // Todas las obras cuya portada no carga (vacía o en un host muerto) y que
    // tampoco tienen una buena de alguna fuente. Aunque ya estén enriquecidas.
    const conBuena = new Set();
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db
        .from('fuentes')
        .select('obra_slug, portada_vista')
        .not('portada_vista', 'is', null)
        .order('id')
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      for (const f of data) if (!PORTADA_MUERTA.test(f.portada_vista)) conBuena.add(f.obra_slug);
      if (data.length < 1000) break;
    }
    for (let desde = 0; obras.length < max; desde += 1000) {
      const { data, error } = await db.from('obras').select(cols).order('slug').range(desde, desde + 999);
      if (error) throw new Error(error.message);
      obras.push(
        ...data.filter((o) => !conBuena.has(o.slug) && (!o.portada_url || PORTADA_MUERTA.test(o.portada_url))),
      );
      if (data.length < 1000) break;
    }
    obras = obras.slice(0, max);
    console.log(`${obras.length} obras sin portada que cargue`);
  } else if (args['nivel-a']) {
    // Las obras con SEO completo (ver src/lib/indexacion.ts) a las que les falta
    // lo que más se ve: sinopsis, o una portada que cargue. Se enriquecen aunque
    // ya estén marcadas como `enriquecida`. Lista del sitio publicado.
    const sitio = (process.env.SITE_URL || 'https://www.manhwatonovel.com').replace(/\/$/, '');
    const slugs = await fetch(`${sitio}/obras-nivel-a.json`).then((r) => r.json());
    const buenas = new Set();
    for (let i = 0; i < slugs.length; i += 100) {
      const lote = slugs.slice(i, i + 100);
      const [{ data: os, error: e1 }, { data: fs, error: e2 }] = await Promise.all([
        db.from('obras').select(cols).in('slug', lote),
        db.from('fuentes').select('obra_slug, portada_vista').in('obra_slug', lote).not('portada_vista', 'is', null),
      ]);
      if (e1 || e2) throw new Error((e1 ?? e2).message);
      for (const f of fs) if (!PORTADA_MUERTA.test(f.portada_vista)) buenas.add(f.obra_slug);
      obras.push(...os);
    }
    const portadaMuerta = (o) => !buenas.has(o.slug) && (!o.portada_url || PORTADA_MUERTA.test(o.portada_url));
    obras = obras.filter((o) => !o.sinopsis?.trim() || portadaMuerta(o));
    console.log(`${obras.length} obras A sin sinopsis o sin portada que cargue`);
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
  const procesar = async (obra) => {
    if (esRetirada(obra.slug)) return;
    const res = await enriquecerObra(obra, { todas: Boolean(args.categorias) });
    const parche = parcheDe(obra, res);
    if (args.categorias) parche.categorias_fusionadas = true;
    const { error: e } = await db.from('obras').update(parche).eq('slug', obra.slug);
    if (e) {
      console.error(`  ${obra.slug}: ${e.message}`);
      return;
    }
    if (res) casadas++;
    console.log(`${res ? '✓ ' + res.fuente : '·  sin match'}  ${obra.titulo}`);
  };
  // --categorias: dos obras a la vez. Con las cuatro bases ya en paralelo, dos
  // hilos quedan por debajo de los límites (AniList 90/min, Jikan 60/min).
  // ponytail: hilos fijos; si alguna base empieza a dar 429, bajar a 1.
  const hilos = args.categorias ? Number(args.hilos) || 2 : 1;
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: hilos }, async () => {
      while (siguiente < obras.length) await procesar(obras[siguiente++]);
    }),
  );
  console.log(`\n${casadas}/${obras?.length ?? 0} obras enriquecidas`);
}
