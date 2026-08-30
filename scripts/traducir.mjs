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
 * Proveedor vía .env (ver el bloque "Proveedor" más abajo):
 *   LIBRETRANSLATE_URL=http://localhost:5000   gratis e ILIMITADO, local
 *   DEEPL_API_KEY=...                          mejor prosa, 500.000 chars/mes
 * Si están los dos, manda LibreTranslate: es el que no tiene tope.
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
// Los idiomas destino se calculan más abajo (`objetivos`): incluyen el base,
// porque un texto en inglés también necesita su versión española.

// ── Idioma de cada texto ─────────────────────────────────────────────────────
// El catálogo NO está todo en español: `enriquecer.mjs` rellena las sinopsis
// desde AniList/MangaBaka y llegan EN INGLÉS, junto a títulos que sí son
// españoles. Declarar `source: es` sobre un texto inglés produce basura, así que
// cada texto viaja con su propio idioma de origen.
//
// La detección es una heurística local (sin red, así vale igual para DeepL):
// palabras vacías muy frecuentes de cada idioma más los caracteres que solo
// existen en español. Ante la duda —textos cortos, recuentos parejos— se queda
// con el idioma base: la opción que no estropea nada, porque como mucho deja un
// texto sin traducir en vez de mandarlo al traductor con el idioma equivocado.
const VACIAS_ES = /\b(que|de|la|el|los|las|un|una|con|por|para|del|al|se|su|no|pero|como|cuando|donde|sin|sobre|es|son)\b/gi;
const VACIAS_EN = /\b(the|of|and|to|in|is|was|his|her|with|that|for|from|by|on|at|as|but|not|are|this)\b/gi;

function idiomaDe(texto) {
  const es = (texto.match(VACIAS_ES) ?? []).length + (/[ñáéíóú¿¡]/i.test(texto) ? 3 : 0);
  const en = (texto.match(VACIAS_EN) ?? []).length;
  // Margen de 2: sin ventaja clara gana el base. Evita destrozar títulos cortos.
  return en > es + 2 ? 'en' : base;
}

// ── Todo el texto traducible del sitio ───────────────────────────────────────
// La interfaz y los capítulos de ejemplo salen de mockData.ts; el CATÁLOGO sale
// de Supabase, que es donde vive de verdad. Antes solo se leía el mock: con una
// obra de ejemplo el script decía "todo al día" y las miles de obras reales no
// se traducían nunca.
const mock = readFileSync('src/lib/mockData.ts', 'utf8');
const literales = (bloque) =>
  [...bloque.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) =>
    m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'"),
  );

/** texto → idioma de origen. El Map evita traducir dos veces el mismo texto. */
const textos = new Map();
const anadir = (t, src) => {
  const limpio = String(t ?? '').trim();
  if (limpio) textos.set(limpio, src ?? idiomaDe(limpio));
};

// Interfaz y capítulos de ejemplo: escritos en español, sin detección.
for (const m of mock.matchAll(/^\s*titulo: '((?:[^'\\]|\\.)*)',$/gm)) anadir(m[1], base);
for (const m of mock.matchAll(/sinopsis:\n\s*'((?:[^'\\]|\\.)*)',/g)) anadir(m[1], base);
const parrafos = mock.match(/const PARRAFOS_ES = \[([\s\S]*?)\n\];/);
if (parrafos) for (const p of literales(parrafos[1])) anadir(p, base);
const totales = [...mock.matchAll(/^\s*'[\w-]+': (\d+),$/gm)].map((m) => +m[1]);
for (let n = 1; n <= Math.max(0, ...totales); n++) anadir(`Capítulo ${n}`, base);

// El catálogo real. La anon key basta: `obras` es de lectura pública.
const urlSb = process.env.PUBLIC_SUPABASE_URL;
const claveSb = process.env.PUBLIC_SUPABASE_ANON_KEY;
if (urlSb && claveSb) {
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(urlSb, claveSb, { auth: { persistSession: false } });
  const TAM = 1000;
  const tope = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1]) || Infinity;
  let leidas = 0;
  for (let desde = 0; leidas < tope; desde += TAM) {
    const { data, error } = await db
      .from('obras')
      .select('titulo, sinopsis')
      .eq('publicada', true)
      .range(desde, desde + TAM - 1);
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!data?.length) break;
    for (const o of data) {
      if (leidas >= tope) break;
      anadir(o.titulo);
      // Párrafo a párrafo, igual que lo consume `traducirTexto()` en el sitio:
      // si no, el hash del bloque entero no casaría con el que busca la web.
      for (const parr of String(o.sinopsis ?? '').split('\n\n')) anadir(parr);
      leidas++;
    }
    if (data.length < TAM) break;
  }
  console.log(`Catálogo leído de Supabase: ${leidas} obras`);
} else {
  console.log('Sin credenciales de Supabase: solo se traducen los textos del mock.');
}

const lista = [...textos.entries()].map(([texto, src]) => ({ texto, src }));

// ── Qué falta ────────────────────────────────────────────────────────────────
// Los destinos son TODOS los idiomas del sitio, el base incluido: una sinopsis
// en inglés necesita su versión española tanto como la francesa. Lo único que
// nunca se hace es traducir un texto a su propio idioma.
const cache = JSON.parse(readFileSync(RUTA_CACHE, 'utf8'));
const objetivos = codigos.filter((c) => !soloIdioma || c === soloIdioma);
const faltan = {};
let caracteres = 0;

for (const idioma of objetivos) {
  faltan[idioma] = lista.filter((x) => x.src !== idioma && !cache[hash(x.texto)]?.[idioma]);
  caracteres += faltan[idioma].reduce((s, x) => s + x.texto.length, 0);
}

const foraneos = lista.filter((x) => x.src !== base).length;
console.log(`Textos del sitio: ${lista.length} (${foraneos} detectados en otro idioma)`);
for (const idioma of objetivos) {
  // El denominador es cuántos textos PUEDEN traducirse a este idioma (los que
  // no están ya en él), para que el porcentaje signifique algo.
  const posibles = lista.filter((x) => x.src !== idioma).length;
  const hechos = posibles - faltan[idioma].length;
  const pct = posibles ? Math.round((hechos / posibles) * 100) : 100;
  console.log(`  ${idioma}: ${hechos}/${posibles} (${pct}%) · faltan ${faltan[idioma].length}`);
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
// Dos opciones, y la elige el .env:
//
//   LIBRETRANSLATE_URL=http://localhost:5000   → LibreTranslate, gratis e
//     ILIMITADO, pero corriendo en TU máquina. Las instancias públicas ya no
//     sirven (comprobadas 12: caídas, 403 o con clave de pago), así que la
//     única vía libre es levantarlo local:
//         pip install libretranslate
//         libretranslate --load-only es,en,pt,fr,de,id,vi
//     Traduce con Argos: peor que DeepL, pero sin límite de caracteres. Para
//     6.800 sinopsis × 6 idiomas es la única forma que no cuesta dinero —lo que
//     cuesta es tiempo de CPU, y eso se deja corriendo por la noche—.
//
//   DEEPL_API_KEY=...   → DeepL, 500.000 caracteres/mes gratis. Mucha mejor
//     prosa; alcanza para las obras que de verdad traen tráfico, no para todas.
//
// Se prefiere LibreTranslate si está configurado: es el que no tiene tope.
const urlLibre = process.env.LIBRETRANSLATE_URL?.replace(/\/+$/, '');
const clave = process.env.DEEPL_API_KEY;
if (!urlLibre && !clave) {
  console.error('\nFalta proveedor. Pon una de las dos en .env:');
  console.error('  LIBRETRANSLATE_URL=http://localhost:5000   (gratis, ilimitado, local)');
  console.error('  DEEPL_API_KEY=...                          (mejor prosa, 500k/mes)');
  process.exit(1);
}

// La API gratuita de DeepL vive en api-free; la de pago en api. La clave lo dice.
const endpoint = clave?.endsWith(':fx')
  ? 'https://api-free.deepl.com/v2/translate'
  : 'https://api.deepl.com/v2/translate';

/** LibreTranslate acepta un array en `q` y devuelve otro en `translatedText`. */
async function loteLibre(textos, idioma, origen) {
  const res = await fetch(`${urlLibre}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: textos,
      source: origen,
      target: idioma, // usa códigos planos: 'pt', no 'PT-BR'
      format: 'text',
      ...(process.env.LIBRETRANSLATE_API_KEY ? { api_key: process.env.LIBRETRANSLATE_API_KEY } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const salida = j.translatedText;
  if (!Array.isArray(salida)) throw new Error(`LibreTranslate devolvió algo raro: ${JSON.stringify(j).slice(0, 200)}`);
  return salida;
}

async function loteDeepL(textos, idioma, origen) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${clave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: textos,
      source_lang: origen.toUpperCase(),
      target_lang: idioma === 'pt' ? 'PT-BR' : idioma.toUpperCase(),
      // Es prosa de ficción: preserva el formato y no parte los diálogos.
      preserve_formatting: true,
    }),
  });
  if (!res.ok) throw new Error(`DeepL ${res.status}: ${await res.text()}`);
  return (await res.json()).translations.map((t) => t.text);
}

const traducirLote = urlLibre ? loteLibre : loteDeepL;
console.log(`Proveedor: ${urlLibre ? `LibreTranslate (${urlLibre})` : 'DeepL'}`);

// ── Traducir en lotes, guardando sobre la marcha ─────────────────────────────
// Se escribe el caché tras cada lote: si algo falla a mitad, lo ya pagado
// queda guardado y el siguiente intento retoma donde se quedó.
const LOTE = 40;

for (const idioma of objetivos) {
  const pendientes = faltan[idioma];
  if (!pendientes.length) continue;

  // Un lote solo puede llevar textos del MISMO idioma de origen: el traductor
  // recibe un único `source` por petición. Se agrupan por origen y se manda
  // cada grupo por separado.
  const porOrigen = new Map();
  for (const x of pendientes) {
    (porOrigen.get(x.src) ?? porOrigen.set(x.src, []).get(x.src)).push(x.texto);
  }

  let hechos = 0;
  for (const [origen, grupo] of porOrigen) {
    for (let i = 0; i < grupo.length; i += LOTE) {
      const trozo = grupo.slice(i, i + LOTE);
      let traducidos;
      try {
        traducidos = await traducirLote(trozo, idioma, origen);
      } catch (e) {
        // Un par de idiomas sin modelo (o un lote que el motor rechaza) no debe
        // tirar la corrida entera: se anota y se sigue con el resto.
        console.error(`  ${origen}→${idioma}: ${e.message.slice(0, 120)}`);
        break;
      }

      trozo.forEach((texto, j) => {
        if (!traducidos[j]) return;
        const k = hash(texto);
        cache[k] ??= {};
        cache[k][idioma] = traducidos[j];
      });

      // Se escribe tras cada lote: si algo falla a mitad, lo ya traducido queda
      // guardado y el siguiente intento retoma donde se quedó.
      writeFileSync(RUTA_CACHE, JSON.stringify(cache) + '\n');
      hechos += trozo.length;
      console.log(`  ${idioma} (desde ${origen}): ${hechos}/${pendientes.length}`);
    }
  }
}

console.log('\nListo. Ahora: npm run build');
