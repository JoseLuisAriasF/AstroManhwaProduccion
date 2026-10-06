/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COLA EDITORIAL: qué fichas necesitan sinopsis HUMANA, por orden de ROI
 * ─────────────────────────────────────────────────────────────────────────────
 * El máximo retorno NO es escribir 5.235 sinopsis. Es escribir las de las obras
 * que YA reciben impresiones en Google pero están indexables y sin prosa propia:
 * la intersección de tres conjuntos que ya existen, sin añadir estado ni egreso.
 *
 *   con-trafico.json   obras con impresiones medidas en GSC (src/lib)
 *   sitemap-obras.xml  las fichas indexables A+B (la decisión A/B/C del build)
 *   obras.sinopsis=''  las que no tienen sinopsis escrita (Supabase, anon)
 *
 * Salida: scripts/sinopsis-pendientes.csv, nivel A primero (valor único: tienen
 * manhwa + novela), luego alfabético. El orden fino por volumen de impresiones
 * necesita el export de GSC (`npm run trafico`); esto prioriza por tipo de página.
 *
 * Correr:  npm run pendientes
 * Es solo lectura. No escribe en Supabase ni toca el sitio.
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const SUPA = env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const KEY = env.PUBLIC_SUPABASE_ANON_KEY;
const SITE = env.SITE_URL || 'https://www.manhwatonovel.com';
if (!SUPA || !KEY) { console.error('Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY en .env'); process.exit(1); }

const slugsDe = (xml) => new Set([...xml.matchAll(/\/novela\/([^/<]+)\//g)].map((m) => m[1]));

const trafico = new Set(JSON.parse(fs.readFileSync('src/lib/con-trafico.json', 'utf8')));
const [indexable, nivelA] = await Promise.all([
  fetch(`${SITE}/sitemap-obras.xml`).then((r) => r.text()).then(slugsDe),
  fetch(`${SITE}/sitemap-ambos.xml`).then((r) => r.text()).then(slugsDe),
]);

// Slugs con sinopsis vacía, paginado (anon, count exacto no hace falta aquí).
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const vacias = new Set();
for (let off = 0; ; off += 1000) {
  const rows = await fetch(`${SUPA}/rest/v1/obras?select=slug&sinopsis=eq.&limit=1000&offset=${off}`, { headers: H }).then((r) => r.json());
  if (!Array.isArray(rows) || !rows.length) break;
  for (const o of rows) vacias.add(o.slug);
  if (rows.length < 1000) break;
}

const cola = [...trafico]
  .filter((s) => indexable.has(s) && vacias.has(s))
  .map((slug) => ({ slug, nivel: nivelA.has(slug) ? 'A' : 'B', url: `${SITE}/novela/${slug}/` }))
  .sort((a, b) => (a.nivel === b.nivel ? a.slug.localeCompare(b.slug) : a.nivel === 'A' ? -1 : 1));

const csv = ['slug,nivel,url', ...cola.map((o) => `${o.slug},${o.nivel},${o.url}`)].join('\n');
fs.writeFileSync('scripts/sinopsis-pendientes.csv', csv + '\n');
const nA = cola.filter((o) => o.nivel === 'A').length;
console.log(`Cola editorial: ${cola.length} fichas (nivel A: ${nA}, nivel B: ${cola.length - nA})`);
console.log('→ scripts/sinopsis-pendientes.csv');
