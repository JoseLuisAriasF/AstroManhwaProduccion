/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS DOMINIOS DEL CATÁLOGO
 * ─────────────────────────────────────────────────────────────────────────────
 * `/leer?u=…` trae el capítulo de la fuente y lo devuelve dentro del sitio. Si
 * aceptara cualquier URL sería un proxy abierto: cualquiera pediría lo que
 * quisiera desde nuestra IP. La lista de `src/lib/fuentes.ts` es lo que lo
 * impide, y este script la genera de lo que hay indexado de verdad.
 *
 *   npm run dominios
 *
 * Hay que correrlo al añadir un sitio nuevo. Si un dominio falta, su capítulo
 * no se rompe: se abre en pestaña, como antes del visor.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Cuántos capítulos aporta cada dominio: el peso es lo que dice si merece la
// pena mantener un sitio o si su ausencia se nota.
// Se pagina por el ÚLTIMO id visto, no con `range`. `range` es OFFSET/LIMIT y
// con 642.000 filas la página 600 obliga a recorrer y tirar 600.000 filas antes
// de devolver 1.000: la capa gratis corta con `statement timeout`. Con
// `gt('id', ultimo)` cada página entra por el índice de la PK y cuesta igual la
// primera que la última. El orden total por id sigue evitando filas perdidas.
const dominios = new Map();
let ultimo = '00000000-0000-0000-0000-000000000000';
for (;;) {
  const { data, error } = await db
    .from('capitulos_externos')
    .select('id, url')
    .eq('aprobado', true)
    .gt('id', ultimo)
    .order('id')
    .limit(1000);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  ultimo = data[data.length - 1].id;
  for (const c of data) {
    try {
      const host = new URL(c.url).hostname.replace(/^www\./, '');
      const e = dominios.get(host) ?? { n: 0 };
      e.n++;
      dominios.set(host, e);
    } catch {}
  }
  if (data.length < 1000) break;
}

const total = [...dominios.values()].reduce((s, e) => s + e.n, 0);
const lista = [...dominios].sort((a, b) => b[1].n - a[1].n);

console.log(`${dominios.size} dominios · ${total.toLocaleString('es-ES')} capítulos indexados\n`);
for (const [host, { n }] of lista) {
  console.log(`${((n * 100) / total).toFixed(1)}%`.padStart(6), String(n).padStart(7), host);
}
console.log('\nPara la lista DOMINIOS de src/lib/fuentes.ts:\n');
console.log(lista.map(([h]) => `  '${h}',`).join('\n'));
