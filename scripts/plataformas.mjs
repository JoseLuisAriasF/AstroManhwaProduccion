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
        const titulo = a.text().trim();
        return {
          titulo,
          url: abs(a.attr('href'), url),
          numero: numeroDe(titulo) ?? numeroDe(a.attr('href')),
          fecha_texto: $(el).find('.chapter-release-date').text().trim() || null,
        };
      })
      .get();
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

export const PLATAFORMAS = { madara, mangareader, css };

/** Descarta lo que no sirve para indexar: sin título o sin enlace. */
export const utiles = (items) => items.filter((i) => i.titulo && i.url);
