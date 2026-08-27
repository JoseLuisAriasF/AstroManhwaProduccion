/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FUSIONAR: dos fichas que son la MISMA obra → una sola
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuando el emparejado automático no las unió (títulos traducidos distintos, sin
 * clave común), el admin las une a mano. Esto mueve TODO de `src` a `dst` y borra
 * `src`, dejando una sola ficha con el manhwa y la novela juntos.
 *
 *   node --env-file-if-exists=.env scripts/fusionar.mjs --dst=slug-a --src=slug-b --seco
 *   node --env-file-if-exists=.env scripts/fusionar.mjs --dst=slug-a --src=slug-b
 *
 * `dst` es la que se queda (su título/portada mandan). Los títulos de `src` pasan
 * a alternativos, así que si vuelve a aparecer por cualquiera de sus nombres,
 * emparejará sola. Si una es manhwa y la otra novela, `dst` queda como 'ambos'.
 */
import { createClient } from '@supabase/supabase-js';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const seco = process.argv.includes('--seco');

/** Unión de tipos: manhwa + novela = ambos; igual + igual = igual. */
export function tipoFusion(a, b) {
  if (a === 'ambos' || b === 'ambos') return 'ambos';
  return a === b ? a : 'ambos';
}

// self-check
console.assert(tipoFusion('manhwa', 'novela') === 'ambos', 'manhwa+novela=ambos');
console.assert(tipoFusion('manhwa', 'manhwa') === 'manhwa', 'igual se conserva');
console.assert(tipoFusion('ambos', 'novela') === 'ambos', 'ambos absorbe');

const dst = arg('dst');
const src = arg('src');
if (!dst || !src || dst === src) {
  console.error('Uso: --dst=<slug que se queda> --src=<slug que se absorbe>');
  process.exit(1);
}

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const { data: obras, error } = await db.from('obras').select('*').in('slug', [dst, src]);
if (error) throw new Error(error.message);
const oDst = obras.find((o) => o.slug === dst);
const oSrc = obras.find((o) => o.slug === src);
if (!oDst || !oSrc) {
  console.error(`No existe: ${!oDst ? dst : src}`);
  process.exit(1);
}

// Títulos que gana dst: los suyos + título y alternativos de src, sin el propio.
const alts = [...new Set([
  ...(oDst.titulos_alternativos ?? []),
  oSrc.titulo,
  ...(oSrc.titulos_alternativos ?? []),
].filter((t) => t && t !== oDst.titulo))];

const tipo = tipoFusion(oDst.tipo, oSrc.tipo);

const { count: nFuentes } = await db.from('fuentes').select('id', { count: 'exact', head: true }).eq('obra_slug', src);
const { count: nCaps } = await db.from('capitulos_externos').select('id', { count: 'exact', head: true }).eq('obra_slug', src);

console.log(`FUSIÓN  "${oSrc.titulo}" (${oSrc.tipo})  →  "${oDst.titulo}" (${oDst.tipo})`);
console.log(`  fuentes a mover: ${nFuentes} · capítulos a mover: ${nCaps}`);
console.log(`  tipo resultante: ${tipo}`);
console.log(`  alternativos resultantes: ${alts.length}`);

if (seco) {
  console.log('[seco] nada escrito');
  process.exit(0);
}

// Reasignar antes de borrar (FKs por obra_slug texto, no por id).
for (const t of ['fuentes', 'capitulos_externos', 'equivalencias']) {
  const col = t === 'equivalencias' ? 'novela_slug' : 'obra_slug';
  const r = await db.from(t).update({ [col]: dst }).eq(col, src);
  if (r.error) throw new Error(`${t}: ${r.error.message}`);
}

let r = await db.from('obras').update({
  tipo,
  titulos_alternativos: alts,
  portada_url: oDst.portada_url || oSrc.portada_url || '',
}).eq('slug', dst);
if (r.error) throw new Error(`obras dst: ${r.error.message}`);

r = await db.from('obras').delete().eq('slug', src);
if (r.error) throw new Error(`borrar src: ${r.error.message}`);

console.log('listo. Recuerda rebuild (git push / deploy hook).');
