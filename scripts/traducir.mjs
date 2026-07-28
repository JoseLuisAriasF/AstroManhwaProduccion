/**
 * ─────────────────────────────────────────────────────────────────────────────
 * npm run traducir  ·  rellena src/lib/traducciones.json
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Supabase (1 idioma) ──▶ este script ──▶ traducciones.json ──▶ astro build
 *                                                                    │
 *                                              HTML estático /en/ /pt/ /id/…
 *
 * La base de datos nunca guarda traducciones. Este caché es un artefacto de
 * build: se versiona en git, se regenera cuando quieras y no toca la BD.
 *
 * Es incremental por hash del texto origen: solo traduce lo que falta. Publicar
 * un capítulo nuevo son ~12.000 caracteres, no los 480 capítulos otra vez.
 *
 *   npm run traducir              → qué falta, sin llamar a nadie (dry-run)
 *   npm run traducir -- --aplicar → traduce de verdad
 *   npm run traducir -- --idioma=pt --aplicar
 *
 * Proveedor vía .env:
 *   DEEPL_API_KEY=...     (recomendado: 500.000 caracteres/mes gratis)
 * Para cambiar de proveedor solo se reescribe `traducirLote()`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RUTA_CACHE = 'src/lib/traducciones.json';

// ── Mismo hash que src/lib/traducir.ts (FNV-1a 32 bits, base36) ──────────────
function hash(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const soloIdioma = args.find((a) => a.startsWith('--idioma='))?.split('=')[1];

// ── Idiomas destino: los mismos que el sitio, leídos del único sitio de verdad ─
const fuenteI18n = readFileSync('src/lib/i18n.ts', 'utf8');
const base = fuenteI18n.match(/IDIOMA_BASE = '(\w+)'/)[1];
const codigos = [...fuenteI18n.matchAll(/^  (\w+): \{ nombre:/gm)].map((m) => m[1]);
const destinos = codigos.filter((c) => c !== base && (!soloIdioma || c === soloIdioma));

// ── Todo el texto traducible del sitio ───────────────────────────────────────
// Se lee del mismo módulo que consume la web, así nada se queda fuera.
// Al migrar a Supabase, esto pasa a ser un `select` sobre la tabla en idioma base.
const mock = readFileSync('src/lib/mockData.ts', 'utf8');
const literales = (bloque) =>
  [...bloque.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) =>
    m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'"),
  );

const textos = new Set();

// Títulos y sinopsis de novelas
for (const m of mock.matchAll(/^\s*titulo: '((?:[^'\\]|\\.)*)',$/gm)) textos.add(m[1]);
for (const m of mock.matchAll(/sinopsis:\n\s*'((?:[^'\\]|\\.)*)',/g)) textos.add(m[1]);

// Párrafos del cuerpo (el caché va por párrafo: granularidad fina, menos gasto)
const parrafos = mock.match(/const PARRAFOS_ES = \[([\s\S]*?)\n\];/);
if (parrafos) for (const p of literales(parrafos[1])) textos.add(p);

// Títulos de capítulo
const totales = [...mock.matchAll(/^\s*'[\w-]+': (\d+),$/gm)].map((m) => +m[1]);
for (let n = 1; n <= Math.max(0, ...totales); n++) textos.add(`Capítulo ${n}`);

const lista = [...textos].filter(Boolean);

// ── Qué falta ────────────────────────────────────────────────────────────────
const cache = JSON.parse(readFileSync(RUTA_CACHE, 'utf8'));
const faltan = {};
let caracteres = 0;

for (const idioma of destinos) {
  faltan[idioma] = lista.filter((t) => !cache[hash(t)]?.[idioma]);
  caracteres += faltan[idioma].reduce((s, t) => s + t.length, 0);
}

console.log(`Textos del sitio: ${lista.length}`);
for (const idioma of destinos) {
  const hechos = lista.length - faltan[idioma].length;
  const pct = Math.round((hechos / lista.length) * 100);
  console.log(`  ${idioma}: ${hechos}/${lista.length} (${pct}%) · faltan ${faltan[idioma].length}`);
}

if (caracteres === 0) {
  console.log('\nTodo al día. Nada que traducir.');
  process.exit(0);
}

// DeepL cobra por carácter; el aviso evita sorpresas antes de gastar.
console.log(`\nPor traducir: ${caracteres.toLocaleString('es')} caracteres`);

if (!aplicar) {
  console.log('Dry-run. Añade --aplicar para traducir de verdad.');
  process.exit(0);
}

// ── Proveedor ────────────────────────────────────────────────────────────────
const clave = process.env.DEEPL_API_KEY;
if (!clave) {
  console.error('\nFalta DEEPL_API_KEY. Alta gratuita: https://www.deepl.com/pro-api');
  process.exit(1);
}

// La API gratuita vive en api-free; la de pago en api. La clave lo dice.
const endpoint = clave.endsWith(':fx')
  ? 'https://api-free.deepl.com/v2/translate'
  : 'https://api.deepl.com/v2/translate';

async function traducirLote(textos, idioma) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${clave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: textos,
      source_lang: base.toUpperCase(),
      target_lang: idioma === 'pt' ? 'PT-BR' : idioma.toUpperCase(),
      // Es prosa de ficción: preserva el formato y no parte los diálogos.
      preserve_formatting: true,
    }),
  });
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${await res.text()}`);
  return (await res.json()).translations.map((t) => t.text);
}

// ── Traducir en lotes, guardando sobre la marcha ─────────────────────────────
// Se escribe el caché tras cada lote: si algo falla a mitad, lo ya pagado
// queda guardado y el siguiente intento retoma donde se quedó.
const LOTE = 40;

for (const idioma of destinos) {
  const pendientes = faltan[idioma];
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const trozo = pendientes.slice(i, i + LOTE);
    const traducidos = await traducirLote(trozo, idioma);

    trozo.forEach((origen, j) => {
      const k = hash(origen);
      cache[k] ??= {};
      cache[k][idioma] = traducidos[j];
    });

    writeFileSync(RUTA_CACHE, JSON.stringify(cache) + '\n');
    console.log(`  ${idioma}: ${Math.min(i + LOTE, pendientes.length)}/${pendientes.length}`);
  }
}

console.log('\nListo. Ahora: npm run build');
