/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADAPTADORES DE SITIO
 * ─────────────────────────────────────────────────────────────────────────────
 * Un adaptador sabe dos cosas de un sitio: cómo listar sus SERIES y cómo listar
 * los CAPÍTULOS de una serie. Nada más.
 *
 * La mayoría de las scans corren uno de dos temas de WordPress —`madara` y
 * `mangareader`— con el mismo HTML en todas sus instalaciones. Por eso indexar
 * un sitio nuevo de esa familia es un INSERT con su URL: sin selectores y sin
 * deploy. Para el resto queda `css`, que lee los selectores de la fila.
 *
 * Lo que jamás se descarga: el texto del capítulo y las imágenes de las páginas.
 * Solo título, número, fecha y el enlace al sitio de origen.
 */
import * as cheerio from 'cheerio';

export const UA = 'ManhwaToNovelBot/1.0 (+https://www.manhwatonovel.com/bot)';
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** "Capítulo 128 – Título" → 128. null si no hay número reconocible. */
export function numeroDe(texto) {
  if (!texto) return null;
  const m =
    texto.match(/(?:cap[íi]tulo|chapter|cap|ch|episodio|ep)[\s._-]*#?\s*(\d{1,5})/i) ??
    texto.match(/\b(\d{1,5})\b/);
  // Los ".5" existen. La columna es int, así que el número se trunca y el
  // título conserva el ".5" para que el lector los distinga entre sí.
  return m ? Number(m[1]) : null;
}

export function slugify(t) {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ── robots.txt ───────────────────────────────────────────────────────────────
// Esto va a tocar decenas de sitios ajenos, no uno. Respetar robots es lo que
// separa a un indexador de algo que termina baneado por IP.
const robotsCache = new Map();

async function reglas(origen) {
  if (robotsCache.has(origen)) return robotsCache.get(origen);
  const disallow = [];
  try {
    const res = await fetch(`${origen}/robots.txt`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      let aplica = false;
      for (const linea of (await res.text()).split('\n')) {
        const [clave, ...resto] = linea.split('#')[0].split(':');
        const k = clave.trim().toLowerCase();
        const v = resto.join(':').trim();
        if (k === 'user-agent') aplica = v === '*' || UA.toLowerCase().startsWith(v.toLowerCase());
        else if (aplica && k === 'disallow' && v) disallow.push(v);
      }
    }
  } catch {
    /* sin robots.txt legible = sin restricciones declaradas */
  }
  robotsCache.set(origen, disallow);
  return disallow;
}

export async function permitido(url) {
  const u = new URL(url);
  return !(await reglas(u.origin)).some((d) => u.pathname.startsWith(d));
}

// ── fetch ────────────────────────────────────────────────────────────────────
export async function traer(url, { metodo = 'GET', ms = 20000 } = {}) {
  if (!(await permitido(url))) throw new Error(`robots.txt lo prohíbe: ${url}`);
  const res = await fetch(url, {
    method: metodo,
    redirect: 'follow',
    signal: AbortSignal.timeout(ms),
    headers: {
      'User-Agent': UA,
      ...(metodo === 'POST' ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return cheerio.load(await res.text());
}

export async function traerJson(url, { ms = 20000 } = {}) {
  if (!(await permitido(url))) throw new Error(`robots.txt lo prohíbe: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** La portada real detrás del lazy-load. Descarta los placeholders en data:. */
function imagen($, el) {
  const img = $(el).find('img').first();
  const src =
    img.attr('data-src') ||
    img.attr('data-lazy-src') ||
    img.attr('srcset')?.split(',').pop()?.trim().split(' ')[0] ||
    img.attr('src') ||
    '';
  return src.startsWith('data:') ? '' : src;
}

const abs = (href, base) => {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
};

// ── Adaptadores ──────────────────────────────────────────────────────────────
// series(url, sitio)   → [{ titulo, url, portadaUrl }]
// capitulos(url, sitio) → [{ numero, titulo, url, fecha_texto }]

const madara = {
  async series(url) {
    const $ = await traer(url);
    return $('.page-item-detail')
      .map((_, el) => {
        const a = $(el).find('.post-title h3 a, .post-title h5 a').first();
        return { titulo: a.text().trim(), url: abs(a.attr('href'), url), portadaUrl: imagen($, el) };
      })
      .get();
  },
  async capitulos(url) {
    // Madara sirve los capítulos por AJAX: la página de la serie trae solo los
    // últimos. Un POST devuelve el listado completo de una vez.
    let $;
    try {
      $ = await traer(url.replace(/\/?$/, '/') + 'ajax/chapters/', { metodo: 'POST' });
    } catch {
      $ = await traer(url); // instalaciones viejas: ya vienen en el HTML
    }
    return $('li.wp-manga-chapter')
      .map((_, el) => {
        const a = $(el).find('a').first();
        const href = a.attr('href');
        // Capítulos premium/bloqueados (candado, monedas): href="#", sin URL real.
        // Un enlace al que no se puede ir no le sirve al lector; se descartan y el
        // conteo refleja solo lo que de verdad se puede leer.
        if (!href || href === '#') return null;
        const titulo = a.text().trim();
        return {
          titulo,
          url: abs(href, url),
          numero: numeroDe(titulo) ?? numeroDe(href),
          fecha_texto: $(el).find('.chapter-release-date').text().trim() || null,
        };
      })
      .get()
      .filter(Boolean);
  },
};

const mangareader = {
  async series(url) {
    const $ = await traer(url);
    return $('.listupd .bs, .listupd .utao')
      .map((_, el) => {
        const a = $(el).find('a').first();
        return {
          titulo: (a.attr('title') || $(el).find('.tt').text()).trim(),
          url: abs(a.attr('href'), url),
          portadaUrl: imagen($, el),
        };
      })
      .get();
  },
  async capitulos(url) {
    const $ = await traer(url);
    return $('#chapterlist li, .eplister li')
      .map((_, el) => {
        const li = $(el);
        const a = li.find('a').first();
        // Los temas derivados mueven el título a atributos data-*. El orden va
        // del dato más explícito al más frágil; la URL es el último recurso.
        const titulo =
          li.find('.chapternum').text().trim() ||
          a.attr('data-chapter-title') ||
          a.attr('data-chapter-label') ||
          a.text().trim().split('\n')[0].trim();
        return {
          titulo,
          url: abs(a.attr('href'), url),
          numero:
            Number(li.attr('data-num')) || (numeroDe(titulo) ?? numeroDe(a.attr('href'))) || null,
          fecha_texto: li.find('.chapterdate').text().trim() || null,
        };
      })
      .get();
  },
};

/** Selectores desde la BD: para todo lo que no sea uno de los dos temas. */
const css = {
  async series(url, s) {
    const $ = await traer(url);
    return $(s.sel_serie)
      .map((_, el) => {
        const a = $(el).find(s.sel_serie_enlace).first();
        return {
          titulo: $(el).find(s.sel_serie_titulo).first().text().trim(),
          url: abs(a.attr('href'), url),
          portadaUrl: s.sel_serie_portada ? imagen($, el) : '',
        };
      })
      .get();
  },
  async capitulos(url, s) {
    const $ = await traer(url);
    return $(s.sel_item)
      .map((_, el) => {
        const a = $(el).find(s.sel_enlace).first();
        const titulo = $(el).find(s.sel_titulo).first().text().trim();
        return {
          titulo,
          url: abs(a.attr('href'), url),
          numero: numeroDe(titulo) ?? numeroDe(a.attr('href')),
          fecha_texto: s.sel_fecha ? $(el).find(s.sel_fecha).first().text().trim() || null : null,
        };
      })
      .get();
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MangaDex: API pública, no scraping
 * ─────────────────────────────────────────────────────────────────────────────
 * Es la fuente más valiosa de las cuatro y la única que no depende de que un
 * tema de WordPress no cambie mañana. Un endpoint documentado, sin HTML frágil,
 * y —lo importante para este sitio— el feed de capítulos se pide POR IDIOMA:
 * una fila de `sitios` por idioma y la misma obra aparece con 158 capítulos en
 * español y 320 en inglés, que es justo la comparación que la ficha enseña.
 *
 * Trae además títulos alternativos, estado y géneros ya normalizados, así que
 * las obras nacen con la metadata que en las scans hay que rellenar a mano.
 *
 * Solo se guardan metadata y el enlace a mangadex.org. Las páginas de cada
 * capítulo viven en /at-home/, que su robots.txt prohíbe y aquí nunca se toca.
 */
const API = 'https://api.mangadex.org';

/**
 * MangaDex nombra al portugués `pt-br`. La BD guarda el código del sitio ('pt')
 * para que la ficha muestre "Português" y no "PT-BR", y la traducción ocurre
 * solo aquí, al hablar con la API. El resto de nuestros idiomas coincide.
 */
const IDIOMA_MD = { pt: 'pt-br' };
const aMangaDex = (i) => IDIOMA_MD[i] ?? i;

/** El título en el idioma del sitio si existe; si no, inglés; si no, el que haya. */
function mejorTitulo(attrs, idioma) {
  const alt = Object.assign({}, ...(attrs.altTitles ?? []));
  const md = aMangaDex(idioma);
  return (
    attrs.title?.[idioma] ||
    alt[idioma] ||
    attrs.title?.[md] ||
    alt[md] ||
    attrs.title?.en ||
    alt.en ||
    Object.values(attrs.title ?? {})[0] ||
    ''
  );
}

const mangadex = {
  async series(url, sitio) {
    // `descubrir.mjs` sustituye {page} por 1, 2, 3…, pero la API pagina por
    // offset absoluto. La conversión vive aquí para que el resto del pipeline
    // siga tratando a MangaDex como a cualquier otro sitio.
    const u = new URL(url);
    const limite = Number(u.searchParams.get('limit')) || 100;
    const p = Number(u.searchParams.get('offset')) || 1;
    u.searchParams.set('offset', String((p - 1) * limite));

    const j = await traerJson(u.href);
    const idioma = sitio?.idioma ?? 'es';
    return (j.data ?? []).map((m) => {
      const a = m.attributes;
      const portada = m.relationships?.find((r) => r.type === 'cover_art')?.attributes?.fileName;
      const titulo = mejorTitulo(a, idioma);
      return {
        titulo,
        // El slug SIEMPRE sale del título en inglés, no del localizado. Sin
        // esto, las filas es/en/pt crearían tres obras distintas de la misma
        // historia ("Lector omnisciente", "Omniscient Reader's Viewpoint"…) y
        // se perdería la comparación entre idiomas, que es todo el producto.
        slugBase: mejorTitulo(a, 'en') || titulo,
        url: `https://mangadex.org/title/${m.id}`,
        // .256.jpg: la miniatura. La original pesa megas y aquí solo se enlaza.
        portadaUrl: portada ? `https://uploads.mangadex.org/covers/${m.id}/${portada}.256.jpg` : '',
        titulosAlt: [
          ...new Set(
            (a.altTitles ?? []).flatMap((t) => Object.values(t)).filter((t) => t && t !== titulo),
          ),
        ].slice(0, 8),
        estado: a.status === 'ongoing' ? 'En emisión' : 'Finalizado',
        categorias: (a.tags ?? [])
          .filter((t) => t.attributes?.group === 'genre')
          .map((t) => t.attributes.name.es || t.attributes.name.en)
          .slice(0, 6),
      };
    });
  },

  async capitulos(url, f) {
    const id = url.match(/title\/([0-9a-f-]{36})/i)?.[1];
    if (!id) throw new Error(`no es una URL de MangaDex: ${url}`);
    const idioma = f?.idioma ?? 'es';

    // El feed corta a 500. Se pagina hasta agotarlo: hay obras con 1.000+.
    const capitulos = [];
    for (let offset = 0; ; offset += 500) {
      const j = await traerJson(
        `${API}/manga/${id}/feed?limit=500&offset=${offset}` +
          `&translatedLanguage[]=${aMangaDex(idioma)}&order[chapter]=desc&includes[]=scanlation_group`,
      );
      capitulos.push(...(j.data ?? []));
      if (capitulos.length >= (j.total ?? 0) || !j.data?.length) break;
      await espera(300); // la API pide ~5 req/s; esto va muy por debajo
    }

    // Un mismo capítulo lo suben varios grupos. Sin esto, "cap. 12" saldría
    // tres veces en la lista. Gana el primero, que es el más reciente.
    const porNumero = new Map();
    for (const c of capitulos) {
      const clave = c.attributes.chapter ?? `x-${c.id}`;
      if (porNumero.has(clave)) continue;
      porNumero.set(clave, {
        numero: c.attributes.chapter ? Math.trunc(Number(c.attributes.chapter)) || null : null,
        titulo: c.attributes.title || `Capítulo ${c.attributes.chapter ?? '?'}`,
        url: `https://mangadex.org/chapter/${c.id}`,
        fecha_texto: c.attributes.publishAt?.slice(0, 10) ?? null,
      });
    }
    return [...porNumero.values()];
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * sheet: agregador respaldado por una Google Sheet (Apps Script)
 * ─────────────────────────────────────────────────────────────────────────────
 * El patrón de toonflip y muchos agregadores caseros: una hoja de cálculo
 * servida como JSON, un array plano de filas {title, image, links, chapter}.
 * No hay índice de capítulos, solo el ÚLTIMO número y los enlaces a los sitios
 * donde leerlo. Encaja igual en el modelo: cada fila es una obra, y sus enlaces
 * son "dónde leerla" (una entrada por sitio espejo, marcada con el capítulo).
 *
 * La hoja entera es un solo request, así que se memoiza: 52 obras no son 52
 * descargas. La clave es el endpoint sin fragmento.
 */
const sheetCache = new Map();
async function hoja(endpoint) {
  if (!sheetCache.has(endpoint)) sheetCache.set(endpoint, traerJson(endpoint));
  const filas = await sheetCache.get(endpoint);
  return Array.isArray(filas) ? filas : [];
}

// La primera línea del título suele ser el nombre local y la segunda el inglés.
const primeraLinea = (t) => String(t).split(/\\n|\n/)[0].trim();

const sheet = {
  async series(url) {
    // url = endpoint del Apps Script. El fragmento identifica la fila en
    // capitulos(); aquí se ignora y se lee la hoja completa.
    const endpoint = url.split('#')[0];
    return (await hoja(endpoint))
      .filter((f) => f.title && f.links)
      .map((f) => ({
        titulo: primeraLinea(f.title),
        // Cada obra "vive" en el endpoint + su título: así capitulos() la
        // reencuentra sin un segundo esquema de identidad.
        url: `${endpoint}#${encodeURIComponent(primeraLinea(f.title))}`,
        // r2:... son referencias a un bucket privado que necesita firma; no son
        // URLs servibles, así que se descartan y la portada la pone el admin.
        portadaUrl: /^https?:\/\//.test(f.image ?? '') ? f.image : '',
      }));
  },

  async capitulos(url) {
    const [endpoint, frag] = url.split('#');
    const titulo = decodeURIComponent(frag ?? '');
    const fila = (await hoja(endpoint)).find((f) => primeraLinea(f.title) === titulo);
    if (!fila) return [];
    const numero = numeroDe(fila.chapter) ?? numeroDe(String(fila.chapter));
    // Un "capítulo" por sitio espejo: es lo único que la hoja sabe. El lector
    // ve "Cap. 52 · readtoon.com" y elige dónde leer, igual que en toonflip.
    return (fila.links ?? '')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((link) => {
        let host = '';
        try {
          host = new URL(link).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }
        return { numero, titulo: `Capítulo ${fila.chapter} · ${host}`, url: link, fecha_texto: null };
      })
      .filter(Boolean);
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * wetriedtls: Next.js, novelas con capítulos muy adelantados
 * ─────────────────────────────────────────────────────────────────────────────
 * Su catálogo se pinta con JavaScript (no hay listado en el HTML del servidor),
 * pero la PÁGINA DE CADA SERIE sí trae en SSR el título, la portada y el total
 * de capítulos. Y las URLs de capítulo son deterministas: /series/<slug>/chapter-N.
 *
 * Por eso aquí una "fuente" es UNA serie concreta, no un catálogo: se añade la
 * novela que interesa por su URL. El índice de capítulos se sintetiza del total
 * (1..N); no se descarga ni una línea del texto, solo se enlaza a la fuente.
 *
 * ponytail: numeración contigua 1..N asumida. Si la serie tiene side-stories o
 * capítulos ".5", esos enlaces darían 404 en el origen (que los ignora sin más).
 * Basta para un índice; afinar solo si alguna novela lo pide.
 */
const wetriedtls = {
  async series(url) {
    const $ = await traer(url);
    const titulo = ($('meta[property="og:title"]').attr('content') || $('title').text())
      .replace(/\s*[-–|]\s*We Tried TLS\s*$/i, '')
      .trim();
    return titulo ? [{ titulo, url, portadaUrl: $('meta[property="og:image"]').attr('content') || '' }] : [];
  },
  async capitulos(url) {
    const $ = await traer(url);
    let total = 0;
    $('span').each((_, el) => {
      if ($(el).text().trim().toLowerCase() === 'total chapters') {
        total = Number($(el).next().text().replace(/[^\d]/g, '')) || 0;
      }
    });
    const base = url.replace(/\/+$/, '');
    const caps = [];
    for (let n = total; n >= 1; n--) {
      caps.push({ numero: n, titulo: `Chapter ${n}`, url: `${base}/chapter-${n}`, fecha_texto: null });
    }
    return caps;
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * olympus: Nuxt con API de catálogo, sin lista de capítulos
 * ─────────────────────────────────────────────────────────────────────────────
 * Su /api/series lista el catálogo (nombre, portada, total, tipo), pero NO
 * expone la lista de capítulos, y las URLs de capítulo usan ids internos que no
 * se pueden enumerar. La URL pública de una serie es `comic-` + el slug de la
 * API (con su timestamp): /series/comic-<slug>.
 *
 * Igual que hace zonascans, esta fuente es un "enlace a la serie": una tarjeta
 * con el conteo de capítulos que lleva a la página de Olympus, donde se lee.
 * No se listan los capítulos uno a uno porque Olympus no los da.
 */
/**
 * Fuente "link-out": no expone la lista de capítulos, solo el total. La URL de
 * la serie lleva el conteo en el fragmento (#caps=N) que `series()` puso; el
 * lector nunca lo ve (el navegador ignora el fragmento). Devuelve una sola
 * entrada que la ficha pinta como tarjeta con su conteo y el enlace a la serie.
 * Es lo que hace zonascans con Olympus/ManhwaWeb: no lista, enlaza.
 */
async function capitulosEnlace(url) {
  const [limpia, frag = ''] = url.split('#');
  const n = Math.trunc(Number(new URLSearchParams(frag).get('caps'))) || 0;
  if (!n) return [];
  return [{ numero: n, titulo: `Serie completa · ${n} capítulos`, url: limpia, fecha_texto: null }];
}

const OLYMPUS = 'https://olympusxyz.com';

const olympus = {
  async series(url, sitio) {
    const j = await traerJson(url); // url = /api/series?page=N
    const data = j?.data?.series?.data ?? [];
    // El catálogo mezcla cómics y novelas; se filtra por el tipo del sitio.
    const quiere = sitio?.tipo === 'novela' ? 'novel' : 'comic';
    return data
      .filter((s) => (s.type ?? 'comic') === quiere && s.slug)
      .map((s) => ({
        titulo: s.name,
        // Página pública = comic- + el slug de la API. El #caps lo lee capitulos().
        url: `${OLYMPUS}/series/comic-${s.slug}#caps=${s.chapter_count || 0}`,
        portadaUrl: s.cover || '',
      }));
  },
  capitulos: capitulosEnlace,
};

// manhwaweb: SPA con backend público. También agregador (link-out), como Olympus.
const MW_API = 'https://manhwawebbackend-production.up.railway.app';
const MW_WEB = 'https://manhwaweb.com';

const manhwaweb = {
  async series(url, sitio) {
    const j = await traerJson(url); // url = MW_API/manhwa/library?page=N
    const data = j?.data ?? [];
    const quiereNovela = sitio?.tipo === 'novela';
    return data
      .filter((x) => (x._tipo === 'novela') === quiereNovela && x.real_id)
      .map((x) => ({
        titulo: x.name_esp || x.the_real_name || '',
        url: `${MW_WEB}/manhwa/${x.real_id}#caps=${Math.trunc(Number(x._numero_cap)) || 0}`,
        portadaUrl: x._imagen || '',
      }));
  },
  capitulos: capitulosEnlace,
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * blogger: blogs de Blogger que publican un capítulo por post
 * ─────────────────────────────────────────────────────────────────────────────
 * Blogger expone un feed JSON público y estable. El patrón habitual: cada post
 * es un capítulo y su ETIQUETA (categoría) es la serie —"El Regreso ... (Novela)
 * Capítulo 65" con la etiqueta "El Regreso ... (Novela)". El feed lista todas
 * las etiquetas de una vez, así que las series se sacan sin recorrer nada.
 *
 * Solo se toman las etiquetas con marcador de tipo entre paréntesis —(Novela),
 * (Manhwa)…—; el resto de un blog así suele ser ruido (títulos sueltos usados
 * como etiqueta). El texto del capítulo nunca se copia: se enlaza al post.
 */
// Marca de tipo al final del título de la página: "... Novela" / "... Manhwa".
const MARCA_FIN = /\s+\(?(novela|novel|manhwa|manhua|manga)\)?\s*$/i;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * blogger: blogs de Blogger que INDEXAN capítulos en páginas estáticas (/p/…)
 * ─────────────────────────────────────────────────────────────────────────────
 * El feed de posts por etiqueta solo trae una fracción (p.ej. 40 de 500): el
 * índice completo de cada obra vive en una PÁGINA del blog (/p/<slug>.html), una
 * lista de enlaces al capítulo —a menudo alojado en OTRO host (sinacortadores)—.
 *
 * Así que las series son las páginas (feed /feeds/pages/default) y los capítulos
 * se sacan parseando los enlaces de esa página. El texto del capítulo nunca se
 * copia: se enlaza al origen.
 */
/** Feed de posts por etiqueta (fallback cuando la página /p/ no lista nada). */
async function bloggerPorEtiqueta(base, etiqueta) {
  const caps = [];
  const url = `${base}/feeds/posts/default/-/${encodeURIComponent(etiqueta)}`;
  for (let start = 1, iter = 0; iter < 500; iter++) {
    const j = await traerJson(`${url}?alt=json&max-results=150&start-index=${start}`);
    const entradas = j?.feed?.entry ?? [];
    if (!entradas.length) break;
    for (const e of entradas) {
      const titulo = e.title?.$t ?? '';
      const link = (e.link ?? []).find((l) => l.rel === 'alternate')?.href;
      if (link) caps.push({ numero: numeroDe(titulo), titulo, url: link, fecha_texto: e.published?.$t?.slice(0, 10) ?? null });
    }
    start += entradas.length;
    await espera(250);
  }
  return caps;
}

const blogger = {
  async series(url, sitio) {
    const base = new URL(url).origin;
    const marca = sitio?.tipo === 'manhwa' ? /manhwa|manhua|manga/i : /novela|novel/i;
    const tipoTxt = sitio?.tipo === 'manhwa' ? 'Manhwa' : 'Novela';
    // El feed de páginas devuelve ~70 por request: se pagina con start-index
    // hasta agotarlo (hay blogs con 120+ páginas).
    const out = [];
    for (let start = 1, iter = 0; iter < 50; iter++) {
      const j = await traerJson(`${base}/feeds/pages/default?alt=json&max-results=150&start-index=${start}`);
      const entries = j?.feed?.entry ?? [];
      if (!entries.length) break;
      for (const e of entries) {
        const bruto = (e.title?.$t ?? '').trim();
        const href = (e.link ?? []).find((l) => l.rel === 'alternate')?.href;
        // El título de la página lleva el tipo al final ("... Novela"): se quita
        // para emparejar con la obra por su nombre limpio. La etiqueta del feed
        // (para el fallback) viaja en el fragmento #etq —el navegador lo ignora—.
        const titulo = bruto.replace(MARCA_FIN, '').trim();
        if (href && titulo && marca.test(bruto)) {
          out.push({ titulo, url: `${href}#etq=${encodeURIComponent(`${titulo} (${tipoTxt})`)}`, portadaUrl: '' });
        }
      }
      start += entries.length;
      await espera(250);
    }
    return out;
  },
  async capitulos(url) {
    const [pagina, frag = ''] = url.split('#');
    const $ = await traer(pagina);
    const vistos = new Set();
    const caps = [];
    $('a[href^="http"]').each((_, el) => {
      const href = $(el).attr('href');
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      // Solo enlaces de capítulo: descarta imágenes, ko-fi, navegación del blog.
      if (!href || !/cap[íi]tulo|chapter/i.test(txt)) return;
      if (vistos.has(href)) return;
      vistos.add(href);
      caps.push({ titulo: txt, url: href, numero: numeroDe(txt) ?? numeroDe(href), fecha_texto: null });
    });
    if (caps.length) return caps;
    // La página no lista capítulos: se cae al feed por la etiqueta de #etq.
    const etq = new URLSearchParams(frag).get('etq');
    return etq ? bloggerPorEtiqueta(new URL(pagina).origin, etq) : [];
  },
};

export const PLATAFORMAS = { madara, mangareader, css, mangadex, sheet, wetriedtls, olympus, blogger, manhwaweb };

/**
 * Plataformas "link-out": su capitulos() no hace ni una petición HTTP, solo lee
 * el #caps= de la URL. El scraper no debe gastarles cortesía (no molestan a
 * ningún sitio) y puede procesarlas en paralelo. Se detecta por la función, no
 * por nombre: cualquier plataforma nueva que reutilice capitulosEnlace entra sola.
 */
export const esEnlace = (plataforma) => PLATAFORMAS[plataforma]?.capitulos === capitulosEnlace;

/** Descarta lo que no sirve para indexar: sin título o sin enlace. */
export const utiles = (items) => items.filter((i) => i.titulo && i.url);
