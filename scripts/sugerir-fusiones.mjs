/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SUGERIR FUSIONES: encuentra fichas que son la misma obra y no se unieron
 * ─────────────────────────────────────────────────────────────────────────────
 * El emparejado de descubrir.mjs es exacto por nombre normalizado. Aun así
 * quedan residuos: una ficha que se creó antes de conocerse el alternativo de
 * otra, o slugs casi iguales. Esto los saca para que el admin los una con
 *   node scripts/fusionar.mjs --dst=A --src=B
 *
 * Modo GRATIS (por defecto): candidatos que comparten un nombre normalizado.
 * Casi-seguros; el emparejado los perdió por orden/tiempo, no por idioma.
 *
 * Modo CROSS-IDIOMA (--pivot, requiere DEEPL_API_KEY): traduce cada título a un
 * pivote (EN) y compara por parecido. Es el único que engancha "La historia de
 * cultivo..." (es) con "The Tale of Cultivation..." (en): distinto texto, sin
 * clave común. No fusiona: SUGIERE, porque un falso positivo funde obras
 * distintas y es feo de deshacer.
 *
 *   node --env-file-if-exists=.env scripts/sugerir-fusiones.mjs
 *   node --env-file-if-exists=.env scripts/sugerir-fusiones.mjs --pivot
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { normalizar } from './emparejar.mjs';

const CACHE = 'scripts/.pivote-cache.json';

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

const obras = await todas('obras', 'slug, titulo, titulos_alternativos, tipo');
console.log(`obras: ${obras.length}`);

// ── Modo gratis: colisión de nombre normalizado entre slugs distintos ─────────
const porNombre = new Map(); // nombre → Set<slug>
for (const o of obras) {
  for (const n of [o.titulo, ...(o.titulos_alternativos ?? [])]) {
    const k = normalizar(n);
    if (k.length < 4) continue; // siglas cortas dan choques absurdos
    (porNombre.get(k) ?? porNombre.set(k, new Set()).get(k)).add(o.slug);
  }
}

const grupos = new Map(); // clave = slugs ordenados → nombre que los unió
for (const [nombre, slugs] of porNombre) {
  if (slugs.size < 2) continue;
  const key = [...slugs].sort().join('|');
  if (!grupos.has(key)) grupos.set(key, nombre);
}

const tituloDe = Object.fromEntries(obras.map((o) => [o.slug, `${o.titulo} (${o.tipo})`]));
console.log(`\n=== candidatos GRATIS (mismo nombre, fichas distintas): ${grupos.size} ===`);
for (const [key, nombre] of grupos) {
  const slugs = key.split('|');
  console.log(`· "${nombre}"`);
  for (const s of slugs) console.log(`    ${s}  — ${tituloDe[s]}`);
  console.log(`    → node scripts/fusionar.mjs --dst=${slugs[0]} --src=${slugs[1]}`);
}

if (!process.argv.includes('--pivot')) {
  console.log('\n--pivot añade candidatos cross-idioma (es↔en) traduciendo a un pivote EN');
  console.log('con LibreTranslate OFFLINE — gratis y sin límite. Arráncalo una vez:');
  console.log('  docker run -ti --rm -p 5000:5000 libretranslate/libretranslate --load-only en,es,ko');
  console.log('y luego: node --env-file-if-exists=.env scripts/sugerir-fusiones.mjs --pivot');
  process.exit(0);
}

// ── Modo cross-idioma: pivote EN via LibreTranslate (offline, gratis, ilimitado) ─
// Un traductor local: nada de claves, nada de cuota. Traducir todo a un mismo
// idioma es lo que permite comparar "La historia de cultivo…" con "The Tale of
// Cultivation…". Se cachea por título para que re-correr sea instantáneo.
const LT = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

async function traducir(q) {
  const res = await fetch(`${LT}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, source: 'auto', target: 'en', format: 'text' }),
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}: ${await res.text()}`);
  return (await res.json()).translatedText;
}

async function aPivote(titulos) {
  const faltan = [...new Set(titulos.filter((t) => t && !(t in cache)))];
  for (let i = 0; i < faltan.length; i++) {
    try {
      cache[faltan[i]] = await traducir(faltan[i]);
    } catch (e) {
      if (i === 0) {
        console.error(`\n${e.message}\n¿LibreTranslate en ${LT}? Arráncalo con docker (ver arriba).`);
        process.exit(1);
      }
      cache[faltan[i]] = faltan[i]; // un título suelto que falle no tumba la corrida
    }
    if (i % 25 === 0) {
      writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  ${i}/${faltan.length}`);
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache));
}
const pivoteDe = (t) => normalizar(cache[t] ?? t);

console.log(`\ntraduciendo títulos a pivote EN via ${LT} (cacheado)…`);
await aPivote(obras.map((o) => o.titulo));

/** Trigramas de una cadena, para el índice de bloqueo y el parecido. */
const trigs = (s) => {
  const p = ` ${s} `;
  const out = new Set();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
};
const jaccard = (a, b) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

// Bloqueo por token del pivote (≥4 chars): solo se comparan obras que comparten
// alguna palabra, no las 9000×9000. Idiomas via fuentes para priorizar mezcla.
const STOP = new Set(['the', 'and', 'with', 'that', 'this', 'from', 'into', 'novel', 'manhwa']);
const pv = obras.map((o) => {
  const p = pivoteDe(o.titulo);
  return { slug: o.slug, tipo: o.tipo, pivote: p, tg: trigs(p), toks: p.split(' ').filter((w) => w.length >= 4 && !STOP.has(w)) };
});

const porToken = new Map();
for (const o of pv) for (const t of o.toks) (porToken.get(t) ?? porToken.set(t, []).get(t)).push(o);

const vistos = new Set();
const sugerencias = [];
for (const lista of porToken.values()) {
  if (lista.length > 60) continue; // token demasiado común: no discrimina
  for (let i = 0; i < lista.length; i++)
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      const par = [a.slug, b.slug].sort().join('|');
      if (vistos.has(par) || a.slug === b.slug) continue;
      vistos.add(par);
      if (a.pivote === b.pivote) continue; // idéntico ya lo pilla el modo gratis
      const sim = jaccard(a.tg, b.tg);
      if (sim >= 0.55) sugerencias.push({ sim, a, b });
    }
}
sugerencias.sort((x, y) => y.sim - x.sim);

console.log(`\n=== candidatos CROSS-IDIOMA (parecido de pivote ≥0.55): ${sugerencias.length} ===`);
for (const { sim, a, b } of sugerencias.slice(0, 100)) {
  console.log(`· ${sim.toFixed(2)}  "${a.pivote}"  ~  "${b.pivote}"`);
  console.log(`    ${a.slug} (${a.tipo})  |  ${b.slug} (${b.tipo})`);
  console.log(`    → node scripts/fusionar.mjs --dst=${a.slug} --src=${b.slug}`);
}
