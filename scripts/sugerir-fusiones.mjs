/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SUGERIR FUSIONES: fichas que son la misma obra y no se unieron
 * ─────────────────────────────────────────────────────────────────────────────
 * El emparejado de descubrir.mjs es exacto por nombre normalizado. Aun así
 * quedan residuos: una ficha creada antes de conocerse el alternativo de otra, o
 * dos traducciones distintas del mismo título —"Cómo me convertí en un hombre
 * casado en otro mundo" y "Me convertí en un hombre casado en otro mundo"—.
 *
 *   npm run sugerir                          # solo mira: duplicados por nombre
 *   npm run sugerir -- --pivot               # además, cruza idiomas (traductor)
 *   npm run sugerir -- --pivot --aplicar     # y las fusiona de verdad
 *
 * El pivote usa el traductor local (carpeta `traductor/`, la API de
 * LibreTranslate): gratis e ilimitado. Arráncalo con `cd traductor && docker
 * compose up -d`. Sin él, el modo pivote no corre.
 *
 * `--aplicar` solo fusiona lo que pasa `mismaObra()`, que es deliberadamente
 * estricto: un falso positivo funde dos obras distintas y deshacerlo es feo.
 * Todo lo demás se imprime como sugerencia para `fusionar.mjs` a mano.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { normalizar, palabrasDe } from './emparejar.mjs';
import { fusionar } from './fusionar.mjs';

const CACHE = 'scripts/.pivote-es-cache.json';
const aplicar = process.argv.includes('--aplicar');
const pivot = process.argv.includes('--pivot');

/**
 * El listón de `--aplicar`: fusiona solo cuando, quitadas las palabras vacías y
 * las etiquetas de relleno, los dos títulos dicen LO MISMO. Con 0,8 se colaban
 * secuelas ("Shin Elf-san wa Yaserarenai" contra "Elf-san wa Yaserarenai"): una
 * palabra de contenido de más ya es otra obra. Lo de 0,8 se sigue imprimiendo
 * como sugerencia para revisarlo a mano.
 */
const AUTO = 0.95;

/**
 * ¿Son la misma obra? Dos condiciones, y las dos importan:
 *
 *  · Las palabras con peso coinciden en ≥0,8 (Jaccard), con 4+ palabras en cada
 *    título. Con menos, una palabra de diferencia YA es otra obra.
 *  · Los NÚMEROS coinciden exactamente. Es la trampa clásica: "La villana … 2"
 *    y "La villana …" comparten todas las palabras salvo el 2, y son la obra y
 *    su secuela. Sin este corte, el parecido las funde.
 */
export function mismaObra(a, b, umbral = 0.8) {
  const pa = palabrasDe(a);
  const pb = palabrasDe(b);
  if (pa.size < 4 || pb.size < 4) return 0;
  const num = (p) => [...p].filter((w) => /^\d+$/.test(w)).sort().join(',');
  if (num(pa) !== num(pb)) return 0; // la secuela no es la obra
  let inter = 0;
  for (const w of pa) if (pb.has(w)) inter++;
  const j = inter / (pa.size + pb.size - inter);
  return j >= umbral ? j : 0;
}

// self-check: el caso real y la trampa de la secuela
console.assert(
  mismaObra(
    'Cómo me convertí en un hombre casado en otro mundo',
    'Me converti en un hombre casado en otro mundo.',
  ) > 0,
  'las dos traducciones del mismo título son la misma obra',
);
console.assert(
  mismaObra('La villana rica se casa dos veces 2', 'La villana rica se casa dos veces') === 0,
  'la secuela NO se funde con la obra',
);
console.assert(mismaObra('El rey demonio', 'El rey demonio negro') === 0, 'títulos cortos, fuera');
console.assert(
  mismaObra('The Gangster Baby of the Duke’s Family', "The Gangster Baby of the Duke's Family (Promo)") === 1,
  'la etiqueta "(Promo)" no hace otra obra',
);
console.assert(
  mismaObra('Shin Elf-san wa Yaserarenai', 'Elf-san wa Yaserarenai') < AUTO,
  'una palabra de contenido de más es una secuela, no un duplicado',
);

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function todas(tabla, cols) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db.from(tabla).select(cols).range(d, d + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const obras = await todas('obras', 'slug, titulo, titulos_alternativos, tipo, sinopsis, portada_url');
console.log(`obras: ${obras.length}`);

// ── Cuál de las dos se queda ────────────────────────────────────────────────
// La que más aporta: fuentes, luego capítulos, luego metadata. Su slug es el que
// sobrevive, y el slug es la URL que Google ya tiene indexada: quedarse con la
// ficha rica y tirar la pobre es también quedarse con la URL que tiene tráfico.
const fuentes = await todas('fuentes', 'obra_slug, n_caps');
const peso = new Map();
for (const f of fuentes) {
  const p = peso.get(f.obra_slug) ?? { fuentes: 0, caps: 0 };
  p.fuentes++;
  p.caps += f.n_caps ?? 0;
  peso.set(f.obra_slug, p);
}
const porSlug = new Map(obras.map((o) => [o.slug, o]));
const puntos = (slug) => {
  const p = peso.get(slug) ?? { fuentes: 0, caps: 0 };
  const o = porSlug.get(slug);
  return [p.fuentes, p.caps, (o?.titulos_alternativos ?? []).length, o?.sinopsis ? 1 : 0, o?.portada_url ? 1 : 0];
};
/** dst primero: el de más peso. Compara campo a campo, sin sumar peras con manzanas. */
function ordenar(a, b) {
  const pa = puntos(a);
  const pb = puntos(b);
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? [a, b] : [b, a];
  return a < b ? [a, b] : [b, a]; // empate total: determinista por slug
}

// ── Candidatos GRATIS: colisión de nombre normalizado entre slugs distintos ──
const porNombre = new Map();
for (const o of obras) {
  for (const n of [o.titulo, ...(o.titulos_alternativos ?? [])]) {
    const k = normalizar(n);
    if (k.length < 4) continue; // siglas cortas dan choques absurdos
    (porNombre.get(k) ?? porNombre.set(k, new Set()).get(k)).add(o.slug);
  }
}

const pares = new Map(); // "a|b" → { a, b, por, parecido }
const anota = (x, y, por, parecido = 1) => {
  if (x === y) return;
  const clave = [x, y].sort().join('|');
  if (!pares.has(clave)) pares.set(clave, { a: x, b: y, por, parecido });
};

for (const [nombre, slugs] of porNombre) {
  if (slugs.size < 2) continue;
  const lista = [...slugs];
  for (let i = 0; i < lista.length; i++)
    for (let j = i + 1; j < lista.length; j++) anota(lista[i], lista[j], `mismo nombre "${nombre}"`);
}
console.log(`\ncandidatos por nombre idéntico: ${pares.size}`);

// ── Candidatos por PARECIDO, en español y —con el traductor— entre idiomas ──
// Un índice por palabra: solo se comparan obras que comparten alguna, no las
// 15.000 × 15.000. Con --pivot, el título de cada obra viaja traducido al
// español, que es lo que permite cruzar "The Married Man…" con "El hombre…".
const LT = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

/**
 * Qué títulos hay que traducir, y desde qué idioma. NLLB **no tiene `auto`**:
 * un idioma fuera de su mapa es un 400. Y tampoco hace falta traducirlo todo:
 *
 *  · CJK (coreano, japonés, chino): no se traduce. Esos títulos ya emparejan
 *    tal cual entre fuentes, que es como se pescan la mayoría de los duplicados.
 *  · Español: es el idioma destino; traducirlo sería ruido.
 *  · El resto se manda como inglés, que es lo que son en la práctica.
 */
const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const PALABRA_ES = /[ñáéíóú¿¡]|\b(de|del|la|el|los|las|un|una|que|en|con|por|para|su|se|es|mi|yo|me)\b/i;
const hayQueTraducir = (t) => !CJK.test(t) && !PALABRA_ES.test(t);

async function traducir(lote) {
  const res = await fetch(`${LT}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: lote, source: 'en', target: 'es', format: 'text' }),
    signal: AbortSignal.timeout(600000),
  });
  if (!res.ok) throw new Error(`traductor ${res.status}`);
  return (await res.json()).translatedText;
}

if (pivot) {
  const faltan = [
    ...new Set(obras.map((o) => o.titulo).filter((t) => t && hayQueTraducir(t) && !(t in cache))),
  ];
  console.log(`\ntraduciendo ${faltan.length} títulos al español via ${LT} (cacheado)…`);
  for (let i = 0; i < faltan.length; i += 16) {
    const lote = faltan.slice(i, i + 16);
    try {
      const t = await traducir(lote);
      lote.forEach((q, j) => (cache[q] = t[j]));
    } catch (e) {
      console.error(`${e.message} — ¿está arrancado el traductor? (cd traductor && docker compose up -d)`);
      if (i === 0) process.exit(1);
      break;
    }
    writeFileSync(CACHE, JSON.stringify(cache));
    if (i % 320 === 0) console.log(`  ${i}/${faltan.length}`);
  }
  writeFileSync(CACHE, JSON.stringify(cache));
}

// Cada obra entra con su título y —si hay pivote— con su traducción.
const nombresDe = (o) => [o.titulo, ...(pivot && cache[o.titulo] ? [cache[o.titulo]] : [])];
const porPalabra = new Map();
for (const o of obras) {
  for (const n of nombresDe(o)) {
    const p = palabrasDe(n);
    if (p.size < 4) continue;
    for (const w of p) (porPalabra.get(w) ?? porPalabra.set(w, []).get(w)).push({ slug: o.slug, n });
  }
}

const comparados = new Set();
for (const lista of porPalabra.values()) {
  if (lista.length > 80) continue; // palabra demasiado común: no discrimina
  for (let i = 0; i < lista.length; i++)
    for (let j = i + 1; j < lista.length; j++) {
      const x = lista[i];
      const y = lista[j];
      if (x.slug === y.slug) continue;
      const clave = [x.slug, y.slug].sort().join('|') + '·' + x.n + '·' + y.n;
      if (comparados.has(clave)) continue;
      comparados.add(clave);
      const sim = mismaObra(x.n, y.n);
      if (sim) anota(x.slug, y.slug, `"${x.n}" ~ "${y.n}"`, sim);
    }
}
console.log(`candidatos en total (nombre + parecido): ${pares.size}`);

// ── Salida ──────────────────────────────────────────────────────────────────
// Union-find pobre: si A se funde en B y luego sale el par (A, C), C tiene que
// ir contra B, que es la que ha quedado viva.
const vive = new Map();
const raiz = (s) => {
  while (vive.has(s)) s = vive.get(s);
  return s;
};

const lista = [...pares.values()].sort((p, q) => q.parecido - p.parecido);
let hechas = 0;
for (const { a, b, por, parecido } of lista) {
  const [x, y] = [raiz(a), raiz(b)];
  if (x === y || !porSlug.has(x) || !porSlug.has(y)) continue;
  const [dst, src] = ordenar(x, y);
  console.log(`\n· ${parecido.toFixed(2)}  ${por}`);
  console.log(`    queda: ${dst}   absorbe: ${src}`);
  if (!aplicar || parecido < AUTO) {
    if (aplicar) console.log(`    (a mano: ${parecido.toFixed(2)} < ${AUTO})`);
    console.log(`    → node scripts/fusionar.mjs --dst=${dst} --src=${src}`);
    continue;
  }
  try {
    const r = await fusionar(db, dst, src);
    vive.set(src, dst);
    hechas++;
    console.log(`    ✓ ${r.fuentes} fuentes y ${r.capitulos} capítulos movidos · tipo ${r.tipo}`);
  } catch (e) {
    console.log(`    ✗ ${e.message}`);
  }
}

console.log(
  aplicar
    ? `\n${hechas} fichas fusionadas. Recuerda rebuild (git push / deploy hook).`
    : `\n${lista.length} candidatos. Añade --aplicar para fusionarlos${pivot ? '' : ', y --pivot para cruzar idiomas'}.`,
);
