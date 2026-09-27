/**
 * Recupera las fichas fusionadas ANTES de que `fusionar.mjs` guardara el slug
 * viejo en `obras.slugs_antiguos`. Search Console las lista como 404
 * (/novela/contra-los-dioses/…): aquí se busca qué obra tiene ese nombre entre
 * sus títulos alternativos —fusionar mete ahí el título de la absorbida— y se
 * le apunta el slug, para que el middleware responda 301 en vez de 404.
 *
 *   node --env-file=.env scripts/recuperar-fusiones.mjs contra-los-dioses trash-of-the-count-s-family …
 *   node --env-file=.env scripts/recuperar-fusiones.mjs --seco contra-los-dioses
 *
 * Acepta URLs enteras de Search Console, también con «-capitulo-N» pegado.
 */
import { createClient } from '@supabase/supabase-js';
import { slugify } from './plataformas.mjs';

const seco = process.argv.includes('--seco');
const pedidos = [
  ...new Set(
    process.argv
      .slice(2)
      .filter((a) => !a.startsWith('--'))
      .map((a) => a.replace(/^https?:\/\/[^/]+/, '').replace(/^\/(?:[a-z]{2}\/)?novela\//, '').split('/')[0])
      .map((s) => s.replace(/-capitulo-\d+$/, ''))
      .filter(Boolean),
  ),
];
if (!pedidos.length) {
  console.error('Uso: recuperar-fusiones.mjs [--seco] <slug o URL>…');
  process.exit(1);
}

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Solo interesan los que de verdad ya no existen.
const { data: vivos, error } = await db.from('obras').select('slug').in('slug', pedidos);
if (error) throw new Error(error.message);
const muertos = pedidos.filter((s) => !vivos.some((v) => v.slug === s));

// Todas las obras con sus alternativos (paginado: Supabase corta en 1.000).
const obras = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error: e } = await db
    .from('obras')
    .select('slug, titulo, titulos_alternativos, slugs_antiguos')
    .order('slug')
    .range(desde, desde + 999);
  if (e) throw new Error(e.message);
  obras.push(...data);
  if (data.length < 1000) break;
}
const porNombre = new Map();
for (const o of obras) for (const t of o.titulos_alternativos ?? []) porNombre.set(slugify(t), o);

for (const viejo of muertos) {
  const o = porNombre.get(viejo);
  if (!o) {
    console.log(`·  ${viejo}: ninguna obra lo tiene como título alternativo`);
    continue;
  }
  if ((o.slugs_antiguos ?? []).includes(viejo)) {
    console.log(`=  ${viejo} → ${o.slug} (ya estaba)`);
    continue;
  }
  console.log(`✓  ${viejo} → ${o.slug}`);
  if (seco) continue;
  // Se actualiza también en memoria: dos slugs viejos de la MISMA obra (p. ej.
  // contra-los-dioses y against-the-gods → atg) no deben pisarse entre sí.
  o.slugs_antiguos = [...(o.slugs_antiguos ?? []), viejo];
  const r = await db.from('obras').update({ slugs_antiguos: o.slugs_antiguos }).eq('slug', o.slug);
  if (r.error) console.error(`   ${r.error.message}`);
}
