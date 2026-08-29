/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ESCRIBE LA GENTE DE VERDAD (autocompletado de Google)
 * ─────────────────────────────────────────────────────────────────────────────
 * El endpoint de sugerencias es público, gratis y sin clave: devuelve lo que
 * Google ve teclear a la gente para un prefijo, por idioma y por país. Eso es
 * investigación de palabras clave real —no volumen estimado, sino consultas
 * que existen— y sale de la misma máquina que ya tiene el catálogo.
 *
 * Para qué sirve aquí: los `titulos_alternativos` de una obra son candidatos a
 * consulta, pero no todos se buscan. Esto dice CUÁL de ellos se escribe y con
 * qué cola ("… novela", "… donde continuar", "… capitulo 174"), y eso es lo que
 * debe ir en el <title>, el h1 y los encabezados de la ficha.
 *
 *   node scripts/palabras.mjs --titulo="Regreso de la Secta del Monte Hua"
 *   node --env-file-if-exists=.env scripts/palabras.mjs --top=25
 *   node ... scripts/palabras.mjs --top=25 --idiomas=es,en,pt
 *
 * Es una herramienta de escritorio: imprime y no toca la base de datos.
 */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const l = a.replace(/^--/, '');
    const i = l.indexOf('=');
    return i === -1 ? [l, 'true'] : [l.slice(0, i), l.slice(i + 1)];
  }),
);

// hl = idioma de la interfaz, gl = país. El par cambia las sugerencias: "novela"
// en es-MX no trae lo mismo que en es-ES. Se eligió el mercado más grande de
// cada idioma de la web.
const MERCADOS = {
  es: { hl: 'es', gl: 'mx' },
  en: { hl: 'en', gl: 'us' },
  pt: { hl: 'pt-BR', gl: 'br' },
  id: { hl: 'id', gl: 'id' },
  fr: { hl: 'fr', gl: 'fr' },
  de: { hl: 'de', gl: 'de' },
  vi: { hl: 'vi', gl: 'vn' },
};

const idiomas = (args.idiomas ?? 'es,en').split(',').filter((c) => c in MERCADOS);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Las sugerencias de Google para un prefijo en un mercado. [] si falla. */
async function sugerencias(consulta, { hl, gl }) {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl}&gl=${gl}&q=${encodeURIComponent(consulta)}`;
  try {
    const res = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    // La respuesta es ["prefijo", ["sug 1", "sug 2", …], …]
    const [, lista] = JSON.parse(await res.text());
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * Un título en todos los mercados pedidos. Además del título pelado se prueba
 * con "novela": es la cola que separa a quien busca el manhwa de quien busca
 * dónde seguir la historia, que es exactamente el lector de este sitio.
 */
async function minar(titulo) {
  const filas = [];
  for (const codigo of idiomas) {
    for (const sufijo of ['', ' novela']) {
      const lista = await sugerencias(titulo + sufijo, MERCADOS[codigo]);
      for (const s of lista) filas.push({ idioma: codigo, consulta: s });
      await espera(400); // el endpoint es gratis; no hay que abusar
    }
  }
  // Sin repetir, y las que traen "novel(a)" primero: son las de intención alta.
  const vistas = new Set();
  return filas
    .filter((f) => !vistas.has(`${f.idioma}|${f.consulta}`) && vistas.add(`${f.idioma}|${f.consulta}`))
    .sort((a, b) => Number(/novel/i.test(b.consulta)) - Number(/novel/i.test(a.consulta)));
}

/** Los títulos a minar: el que se pasó a mano, o las obras más grandes. */
async function titulos() {
  if (args.titulo) return [args.titulo];

  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Pasa --titulo="…" o define PUBLIC_SUPABASE_URL para leer el catálogo.');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });
  // Las destacadas primero: son donde una mejora de <title> rinde más.
  const { data, error } = await db
    .from('obras')
    .select('titulo')
    .eq('publicada', true)
    .order('destacada', { ascending: false })
    .limit(Number(args.top) || 20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => o.titulo);
}

for (const titulo of await titulos()) {
  const filas = await minar(titulo);
  console.log(`\n## ${titulo}  (${filas.length} consultas)`);
  if (!filas.length) console.log('  · sin sugerencias — ese título no se busca con ese nombre');
  for (const f of filas.slice(0, 24)) console.log(`  ${f.idioma}  ${f.consulta}`);
}
