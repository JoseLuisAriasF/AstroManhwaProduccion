/**
 * Snapshot de `obras` y `fuentes` para el build, igual que snapshot.mjs hace con
 * los capítulos.
 *
 * Cada build de Cloudflare leía de Supabase las dos tablas enteras (~15 MB:
 * obras 8,8 + fuentes 5,8). Con los builds de cada `git push` además de los tres
 * programados, eran 3-4 GB al mes: el plan gratis entero (egress al 133 % en
 * septiembre de 2026). Ahora se leen UNA vez por corrida del workflow y el build
 * las baja del release `snapshot` de GitHub (ver snapshotCatalogo en api.ts).
 *
 *   node scripts/snapshot-catalogo.mjs [--archivo=catalogo.json.br]
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';

const archivo = process.argv.find((a) => a.startsWith('--archivo='))?.split('=')[1] ?? 'catalogo.json.br';
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Keyset por la clave, como todasLasFilas de api.ts: sin OFFSET ni filas perdidas. */
async function todas(tabla, columnas, clave, filtrar = (q) => q) {
  const filas = [];
  for (let ultima = null; ; ) {
    let q = filtrar(db.from(tabla).select(columnas)).order(clave).limit(1000);
    if (ultima !== null) q = q.gt(clave, ultima);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) return filas;
    ultima = data[data.length - 1][clave];
  }
}

const [obras, fuentes] = await Promise.all([
  // Las mismas lecturas que hace api.ts (catalogo y cargarFuentes).
  todas('obras', '*', 'slug', (q) => q.eq('publicada', true)),
  todas('fuentes', 'id, obra_slug, nombre, portada_vista, ultimo_cambio, tipo, idioma', 'id'),
]);
const json = JSON.stringify({ hasta: new Date().toISOString(), obras, fuentes });
writeFileSync(archivo, brotliCompressSync(json, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }));
console.log(`${obras.length} obras, ${fuentes.length} fuentes → ${archivo}`);
