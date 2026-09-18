/**
 * Snapshot de `capitulos_externos` para el build, sin gastar egress.
 *
 * Antes cada build de Cloudflare bajaba la tabla entera de Supabase (637.549
 * filas, ~60 MB comprimidos) tres veces al día: ~5,4 GB/mes, el plan gratis
 * entero. Ahora el workflow baja el snapshot anterior del release `snapshot`,
 * este script le aplica SOLO lo que cambió (`modificado_en` y las lápidas de
 * `capitulos_borrados`, ver supabase/schema-snapshot.sql) y lo vuelve a subir.
 * El build lo lee de GitHub (ver cargarExternos en src/lib/api.ts).
 *
 * Se rehace entero si no hay anterior, si el último completo pasó de 7 días,
 * si el conteo no cuadra con la base, o con --completo.
 *
 *   node scripts/snapshot.mjs [--completo] [--archivo=capitulos.json.br]
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const ARCHIVO = args.archivo || 'capitulos.json.br';
const COLS = ['id', 'obra_slug', 'numero', 'titulo', 'url', 'fecha_texto', 'idioma', 'tipo', 'fuente_id'];
const DIA = 86_400_000;

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Keyset por `id`, como todasLasFilas de api.ts: sin OFFSET, sin filas perdidas. */
async function paginar(tabla, columnas, filtrar) {
  const todas = [];
  for (let ultima = null; ; ) {
    let q = filtrar(db.from(tabla).select(columnas)).order('id').limit(1000);
    if (ultima) q = q.gt('id', ultima);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    todas.push(...data);
    if (data.length < 1000) return todas;
    ultima = data.at(-1).id;
  }
}

const aFila = (c) => COLS.map((k) => c[k]);

async function completo() {
  const filas = await paginar('capitulos_externos', COLS.join(','), (q) => q.eq('aprobado', true));
  console.log(`[snapshot] completo: ${filas.length} filas`);
  return new Map(filas.map((c) => [c.id, aFila(c)]));
}

// Margen de 5 min por transacciones que confirman tarde: re-aplicar una fila
// es idempotente, perderla no.
const hasta = new Date(Date.now() - 5 * 60_000).toISOString();
let previo = !args.completo && existsSync(ARCHIVO) ? JSON.parse(brotliDecompressSync(readFileSync(ARCHIVO))) : null;
if (previo && (previo.cols.join() !== COLS.join() || Date.now() - Date.parse(previo.completoEn) > 7 * DIA)) previo = null;

let mapa, completoEn;
if (previo) {
  mapa = new Map(previo.filas.map((f) => [f[0], f]));
  completoEn = previo.completoEn;
  const cambiados = await paginar('capitulos_externos', `${COLS.join(',')},aprobado`, (q) =>
    q.gt('modificado_en', previo.hasta),
  );
  for (const c of cambiados) c.aprobado ? mapa.set(c.id, aFila(c)) : mapa.delete(c.id);
  const borrados = await paginar('capitulos_borrados', 'id', (q) => q.gt('borrado_en', previo.hasta));
  for (const { id } of borrados) mapa.delete(id);
  console.log(`[snapshot] incremental desde ${previo.hasta}: ${cambiados.length} cambiados, ${borrados.length} borrados`);

  // Red de seguridad: un HEAD con el conteo cuesta cero egress. Si no cuadra,
  // algo se coló (un cambio sin trigger, un reloj raro) → se rehace entero.
  const { count, error } = await db
    .from('capitulos_externos')
    .select('id', { count: 'exact', head: true })
    .eq('aprobado', true);
  if (error) throw new Error(error.message);
  if (count !== mapa.size) {
    console.warn(`[snapshot] el conteo no cuadra (base ${count}, snapshot ${mapa.size}): se rehace entero`);
    mapa = null;
  }
}
if (!mapa) {
  mapa = await completo();
  completoEn = hasta;
}

writeFileSync(
  ARCHIVO,
  brotliCompressSync(JSON.stringify({ hasta, completoEn, cols: COLS, filas: [...mapa.values()] }), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
  }),
);
console.log(`[snapshot] ${mapa.size} filas → ${ARCHIVO}`);

// Las lápidas solo hacen falta hasta el próximo incremental; con 14 días de
// margen sobre el tope de 7 del completo, nunca se purga una que se necesite.
await db.from('capitulos_borrados').delete().lt('borrado_en', new Date(Date.now() - 14 * DIA).toISOString());
