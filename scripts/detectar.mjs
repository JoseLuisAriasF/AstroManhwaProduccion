/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DETECTAR: de un dominio a una fila de `sitios`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le das dominios sueltos y averigua solo, para cada uno: a dónde redirige, qué
 * tema de WordPress corre, en qué ruta vive su archivo de series y qué URL de
 * listado funciona. Imprime el INSERT listo para pegar.
 *
 *   node scripts/detectar.mjs leemiau.com legionscans.com otra.com
 *   node scripts/detectar.mjs --tipo=novela --idioma=en sitio.com
 *   node scripts/detectar.mjs --sql < dominios.txt
 *
 * Es lo que evita añadir 40 sitios a mano y descubrir a la semana que 30 no
 * indexaron nada. No escribe en la BD: solo mira y reporta.
 */
import { PLATAFORMAS, UA, espera, utiles } from './plataformas.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.replace(/^--/, '').indexOf('=');
    const limpio = a.replace(/^--/, '');
    return i === -1 ? [limpio, 'true'] : [limpio.slice(0, i), limpio.slice(i + 1)];
  }),
);
const dominios = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/**
 * Cómo pagina cada tema. Se prueban en orden y gana la primera que devuelva
 * series; `{base}` es la ruta del archivo, que casi nunca es la misma:
 * /manga/, /series/, /comics/ y hasta /son/ en un Madara con el slug cambiado.
 */
const PATRONES = {
  madara: ['{base}/page/{page}/?m_orderby=latest'],
  mangareader: ['{base}/?page={page}&order=update', '{base}/page/{page}/'],
};

async function homepage(dominio) {
  const res = await fetch(`https://${dominio.replace(/^https?:\/\//, '')}/`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  return { origen: new URL(res.url).origin, html: await res.text() };
}

/** El tema declarado en el HTML. Es la pista más fiable que da WordPress. */
function tema(html) {
  const m = html.match(/wp-content\/themes\/([a-z0-9_-]+)/i);
  const t = m?.[1].toLowerCase() ?? '';
  if (t.includes('madara')) return 'madara';
  if (t.includes('mangareader') || t.includes('mangastream')) return 'mangareader';
  return null;
}

/**
 * La ruta del archivo de series, deducida de los enlaces de la portada: el
 * primer segmento que más se repite en URLs de dos niveles es el archivo.
 * Así se encontró que un Madara servía sus obras bajo /son/ y no /manga/.
 */
function basesProbables(origen, html) {
  const cuenta = new Map();
  const re = new RegExp(`href="(?:${origen})?/([a-z0-9_-]+)/[a-z0-9][a-z0-9-]{3,}/?"`, 'gi');
  for (const m of html.matchAll(re)) {
    const seg = m[1].toLowerCase();
    if (['wp-json', 'wp-content', 'category', 'tag', 'author', 'page', 'feed'].includes(seg)) continue;
    cuenta.set(seg, (cuenta.get(seg) ?? 0) + 1);
  }
  const ordenadas = [...cuenta].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  // Los nombres de siempre van primero aunque salgan poco: si existen, son.
  const preferidas = ['manga', 'series', 'comic', 'comics', 'manhwa', 'novela', 'novel'];
  return [...new Set([...preferidas.filter((p) => cuenta.has(p)), ...ordenadas])].slice(0, 5);
}

async function detectar(dominio) {
  let origen, html;
  try {
    ({ origen, html } = await homepage(dominio));
  } catch (e) {
    return { dominio, error: e.message };
  }

  const detectado = tema(html);
  const plataformas = detectado ? [detectado] : ['madara', 'mangareader'];
  const bases = basesProbables(origen, html);

  for (const plataforma of plataformas) {
    for (const base of bases) {
      for (const patron of PATRONES[plataforma]) {
        const url = `${origen}${patron.replace('{base}', `/${base}`)}`;
        try {
          const series = utiles(await PLATAFORMAS[plataforma].series(url.replace('{page}', '1')));
          if (series.length >= 5) {
            return { dominio, origen, plataforma, url_series: url, series: series.length, muestra: series[0] };
          }
        } catch {
          /* combinación equivocada, se sigue probando */
        }
        await espera(400);
      }
    }
  }
  return { dominio, origen, tema: detectado, bases, error: 'ninguna combinación devolvió series' };
}

const nombre = (origen) =>
  new URL(origen).hostname
    .replace(/^www\./, '')
    .split('.')[0]
    .replace(/^./, (c) => c.toUpperCase());

const buenos = [];
for (const d of dominios) {
  const r = await detectar(d);
  if (r.url_series) {
    console.log(`✓ ${r.dominio} → ${r.plataforma} · ${r.series} series · ${r.url_series}`);
    console.log(`    ej: ${r.muestra.titulo}`);
    buenos.push(r);
  } else {
    console.log(`✗ ${r.dominio} → ${r.error}${r.bases ? ` (probé /${r.bases.join('/, /')}/)` : ''}`);
  }
  await espera(1000);
}

if (buenos.length) {
  console.log(`\n-- ${buenos.length} de ${dominios.length}. Pegar en supabase/seed-sitios.sql:`);
  console.log('insert into public.sitios (nombre, plataforma, tipo, idioma, url_series, paginas)\nvalues');
  console.log(
    buenos
      .map(
        (r) =>
          `  ('${nombre(r.origen)}', '${r.plataforma}', '${args.tipo ?? 'manhwa'}', '${args.idioma ?? 'es'}',\n   '${r.url_series}', 40)`,
      )
      .join(',\n') + '\non conflict (url_series) do nothing;',
  );
}
