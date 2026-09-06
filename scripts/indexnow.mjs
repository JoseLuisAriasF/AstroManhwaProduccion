/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INDEXNOW: avisar de lo que cambió, en vez de esperar a que pasen
 * ─────────────────────────────────────────────────────────────────────────────
 * Un POST y Bing, Yandex, Naver y Seznam saben qué URLs tocar. Gratis, sin
 * cuota real y sin cuenta: la única prueba de que el dominio es tuyo es que el
 * archivo `public/<clave>.txt` se sirva con la clave dentro.
 *
 * Google NO participa en IndexNow. Ahí lo que mueve la aguja es el sitemap
 * (ya generado) y el enlazado interno; su Indexing API es solo para ofertas de
 * empleo y directos, así que no hay atajo y este script no finge tenerlo.
 *
 * Qué se envía: SOLO lo que cambió de verdad. Mandar las ~7.000 fichas en cada
 * corrida es ruido —y los buscadores lo tratan como tal—. `fuentes.ultimo_cambio`
 * ya marca qué obras recibieron capítulo nuevo, así que esa es la lista.
 *
 *   node --env-file-if-exists=.env scripts/indexnow.mjs            # últimas 24 h
 *   node ... scripts/indexnow.mjs --horas=48
 *   node ... scripts/indexnow.mjs --seco                           # qué mandaría
 *
 * Necesita SITE_URL y las credenciales de Supabase (la anon key basta: solo lee).
 */
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// La clave y el nombre del archivo en `public/` son LO MISMO a propósito: si se
// cambia una hay que cambiar el otro, y el chequeo de abajo lo grita si no.
const CLAVE = '17cb3503ad4bc409be459f0e07c6bacd';
const ARCHIVO_CLAVE = `public/${CLAVE}.txt`;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const l = a.replace(/^--/, '');
    const i = l.indexOf('=');
    return i === -1 ? [l, 'true'] : [l.slice(0, i), l.slice(i + 1)];
  }),
);

const sitio = (process.env.SITE_URL || '').replace(/\/$/, '');
if (!sitio) {
  console.error('Falta SITE_URL (p.ej. https://www.manhwatonovel.com)');
  process.exit(1);
}
if (!existsSync(ARCHIVO_CLAVE)) {
  console.error(`Falta ${ARCHIVO_CLAVE}. Sin ese archivo servido, IndexNow rechaza todo.`);
  process.exit(1);
}

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const horas = Number(args.horas) || 24;
const desde = new Date(Date.now() - horas * 3600_000).toISOString();

// Obras con capítulo nuevo en la ventana. `ultimo_cambio` lo pone scrapear.mjs
// solo cuando la fuente CRECIÓ, así que aquí no entra el ruido de re-scrapear.
const { data, error } = await db
  .from('fuentes')
  .select('obra_slug')
  .gte('ultimo_cambio', desde)
  .limit(10000);
if (error) throw new Error(error.message);

const slugs = [...new Set((data ?? []).map((f) => f.obra_slug).filter(Boolean))];

// Los CAPÍTULOS nuevos, uno a uno. Cada uno tiene su propia página —la arma
// functions/novela/[slug]/[capitulo].ts— y es la URL con más intención de
// búsqueda que produce el sitio: alguien escribe «<obra> cap 1200» el mismo día
// que sale. Avisar solo de la ficha dejaba esa página esperando al rastreo.
//
// `visto_en` es cuándo se indexó la fila, así que la ventana es la misma que
// arriba. Las fuentes link-out quedan fuera (n_caps <= 1): su fila guarda el
// TOTAL en `numero` y enlaza a la serie, no al capítulo, y esa página da 404.
const capitulos = [];
if (slugs.length) {
  const { data: fuentesLinkOut } = await db.from('fuentes').select('id').lte('n_caps', 1);
  const excluir = new Set((fuentesLinkOut ?? []).map((f) => f.id));
  const LOTE_SLUGS = 200; // el filtro `in.()` va en la URL: no cabe el catálogo entero
  for (let i = 0; i < slugs.length; i += LOTE_SLUGS) {
    const { data: nuevos, error: errCaps } = await db
      .from('capitulos_externos')
      .select('obra_slug, numero, fuente_id')
      .in('obra_slug', slugs.slice(i, i + LOTE_SLUGS))
      .gte('visto_en', desde)
      .eq('aprobado', true)
      .not('numero', 'is', null)
      .limit(10000);
    if (errCaps) throw new Error(errCaps.message);
    for (const c of nuevos ?? []) {
      if (!excluir.has(c.fuente_id)) capitulos.push(`${sitio}/novela/${c.obra_slug}/capitulo-${c.numero}`);
    }
  }
}

// La portada y el catálogo cambian con cada tanda nueva, así que van siempre.
const urlList = [
  `${sitio}/`,
  `${sitio}/novelas`,
  ...slugs.map((s) => `${sitio}/novela/${s}`),
  ...new Set(capitulos),
];

console.log(
  `${slugs.length} obras y ${new Set(capitulos).size} capítulos nuevos en ${horas} h → ${urlList.length} URLs`,
);
if (args.seco === 'true') {
  // Las dos puntas: las fichas van primero y los capítulos al final, y lo que
  // hay que mirar en una prueba es justo que los segundos existan.
  for (const u of urlList.slice(0, 5)) console.log(`  ${u}`);
  if (urlList.length > 10) console.log(`  … ${urlList.length - 10} más`);
  for (const u of urlList.slice(-5)) console.log(`  ${u}`);
  process.exit(0);
}

// El endpoint acepta hasta 10.000 URLs por petición; se trocea por si el
// catálogo crece o alguien pasa --horas=720.
const LOTE = 10000;
for (let i = 0; i < urlList.length; i += LOTE) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(sitio).host,
      key: CLAVE,
      keyLocation: `${sitio}/${CLAVE}.txt`,
      urlList: urlList.slice(i, i + LOTE),
    }),
  });
  // 200 y 202 son los dos "recibido". 403 = no encuentra el archivo de clave.
  console.log(`  lote ${i / LOTE + 1}: HTTP ${res.status}${res.ok ? '' : ` — ${await res.text()}`}`);
  if (res.status === 403) console.error(`  ¿se está sirviendo ${sitio}/${CLAVE}.txt?`);
}
