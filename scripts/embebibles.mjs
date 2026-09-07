/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ¿QUÉ FUENTES SE DEJAN ABRIR DENTRO DEL SITIO?
 * ─────────────────────────────────────────────────────────────────────────────
 * El lector abre el capítulo en una ventana sobre la ficha en vez de irse a otra
 * pestaña. Eso solo funciona si el sitio de origen lo permite, y **la mayoría no
 * lo permite**: mandan `X-Frame-Options`, o `frame-ancestors` en su CSP, o
 * rompen el marco con JavaScript. Un iframe bloqueado no avisa: sale en blanco.
 *
 * Así que la lista no se adivina, se mide. Este script prueba las tres cosas
 * sobre una URL real de cada dominio del catálogo y escribe la lista que
 * consume `src/lib/embebibles.ts`.
 *
 *   npm run embebibles              # los 20 dominios con más capítulos
 *   npm run embebibles -- --todos
 *
 * Hay que volver a correrlo de vez en cuando: que hoy se deje no obliga a nada
 * mañana, y añadir una cabecera es lo primero que hace una scan cuando le
 * molesta el tráfico de fuera. Es una foto, no una ley.
 */
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2).map((a) => a.replace(/^--/, '')));
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Una URL de ejemplo por dominio, y cuántos capítulos aporta cada uno: sin ese
// peso, "15 dominios se dejan" no dice nada. Lo que importa es qué porcentaje
// de los capítulos que el lector va a pinchar se puede abrir dentro.
const dominios = new Map();
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db
    .from('capitulos_externos')
    .select('url')
    .eq('aprobado', true)
    .order('id') // orden total, o `range` se salta filas (ver api.ts)
    .range(desde, desde + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  for (const c of data) {
    try {
      const host = new URL(c.url).hostname.replace(/^www\./, '');
      const e = dominios.get(host) ?? { n: 0, ejemplo: c.url };
      e.n++;
      dominios.set(host, e);
    } catch {}
  }
  if (data.length < 1000) break;
}

const total = [...dominios.values()].reduce((s, e) => s + e.n, 0);
const lista = [...dominios].sort((a, b) => b[1].n - a[1].n).slice(0, args.has('todos') ? 999 : 20);

/** Frame-busting clásico: el sitio carga y se saca solo del marco con JS. */
const ROMPE_MARCO = /(top|parent)\s*(!==?|!=)\s*self|self\s*(!==?|!=)\s*top|top\.location\s*(\.href\s*)?=/;

const permiten = [];
for (const [host, { n, ejemplo }] of lista) {
  let veredicto, detalle = '';
  try {
    const r = await fetch(ejemplo, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const xfo = r.headers.get('x-frame-options');
    const fa = (r.headers.get('content-security-policy') ?? '').match(/frame-ancestors[^;]*/i)?.[0];
    const html = await r.text();
    // `frame-ancestors` también puede venir en un <meta>, y algunos hosts
    // (Blogspot) solo lo mandan en el marco interno: por eso se mira el HTML.
    const meta = /<meta[^>]+http-equiv=["']?content-security-policy[^>]*frame-ancestors/i.test(html);
    const js = ROMPE_MARCO.test(html);
    if (xfo) (veredicto = 'BLOQUEA'), (detalle = `X-Frame-Options: ${xfo}`);
    else if (fa) (veredicto = 'BLOQUEA'), (detalle = fa.slice(0, 70));
    else if (meta) (veredicto = 'BLOQUEA'), (detalle = 'frame-ancestors en <meta>');
    else if (js) (veredicto = 'DUDOSO'), (detalle = 'parece romper el marco por JS');
    else (veredicto = 'permite'), permiten.push(host);
  } catch (e) {
    veredicto = 'error';
    detalle = e.message.slice(0, 50);
  }
  console.log(
    veredicto.padEnd(8),
    `${((n * 100) / total).toFixed(1)}%`.padStart(6),
    host.padEnd(28),
    detalle,
  );
}

const cubierto = permiten.reduce((s, h) => s + (dominios.get(h)?.n ?? 0), 0);
console.log(
  `\n${permiten.length} dominios se dejan abrir dentro: ${((cubierto * 100) / total).toFixed(1)} % de los ${total.toLocaleString('es-ES')} capítulos.`,
);
console.log('\nPara src/lib/embebibles.ts:\n');
console.log(permiten.map((h) => `  '${h}',`).join('\n'));
