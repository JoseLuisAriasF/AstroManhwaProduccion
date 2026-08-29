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
// La portada y el catálogo cambian con cada tanda nueva, así que van siempre.
const urlList = [`${sitio}/`, `${sitio}/novelas`, ...slugs.map((s) => `${sitio}/novela/${s}`)];

console.log(`${slugs.length} obras con capítulo nuevo en ${horas} h → ${urlList.length} URLs`);
if (args.seco === 'true') {
  for (const u of urlList.slice(0, 10)) console.log(`  ${u}`);
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
