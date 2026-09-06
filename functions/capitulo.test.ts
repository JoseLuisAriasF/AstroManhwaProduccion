/**
 * Comprueba la página de capítulo del edge SIN red: `fetch` se sustituye por
 * las filas que devolvería PostgREST. Lo que se verifica es lo que se rompe en
 * silencio —que /equivalencia siga llegando a su página estática, que un
 * capítulo inexistente dé 404 y no un 200 vacío, que salgan prev/next y que la
 * equivalencia manhwa→novela se pinte con la fórmula del sitio—.
 *
 *   node --experimental-strip-types functions/capitulo.test.ts
 */
import assert from 'node:assert/strict';
import { onRequest } from './novela/[slug]/[capitulo].ts';

const FILAS: Record<string, unknown[]> = {
  // El capítulo 20 existe en dos fuentes; el 19 y el 21 también, para prev/next.
  'capitulos_externos?obra_slug=eq.monte-hua&numero=eq.20': [
    { titulo: 'Capítulo 20', url: 'https://scan-a.test/c20', tipo: 'manhwa', idioma: 'es', fuente_id: 'f1' },
    { titulo: 'Chapter 20', url: 'https://scan-b.test/c20', tipo: 'novela', idioma: 'en', fuente_id: 'f2' },
  ],
  'capitulos_externos?obra_slug=eq.monte-hua&numero=eq.999': [],
  'capitulos_externos?obra_slug=eq.monte-hua&numero=lt.20': [{ numero: 19 }],
  'capitulos_externos?obra_slug=eq.monte-hua&numero=gt.20': [{ numero: 21 }],
  'capitulos_externos?obra_slug=eq.monte-hua&numero=lt.999': [{ numero: 21 }],
  'capitulos_externos?obra_slug=eq.monte-hua&numero=gt.999': [],
  'obras?slug=eq.monte-hua': [
    { titulo: 'Regreso de la Secta del Monte Hua', titulos_alternativos: ['Return of the Mount Hua Sect', '화산귀환'], tipo: 'ambos' },
  ],
  'fuentes?obra_slug=eq.monte-hua': [
    { id: 'f1', nombre: 'ScanA' },
    { id: 'f2', nombre: 'ScanB' },
    // Link-out: una fila con el TOTAL en `numero` y la URL de la serie.
    { id: 'f3', nombre: 'Olympus' },
  ],
  // Con la exclusión puesta, el capítulo 18 no lo tiene nadie de verdad.
  'capitulos_externos?obra_slug=eq.monte-hua&numero=eq.18&aprobado=eq.true&fuente_id=not.in.(f3)': [],
  // Sin la exclusión sí saldría: es exactamente lo que NO debe pasar.
  'capitulos_externos?obra_slug=eq.monte-hua&numero=eq.18': [
    { titulo: 'Serie completa · 18 capítulos', url: 'https://olympusxyz.test/series/x', tipo: 'manhwa', idioma: 'es', fuente_id: 'f3' },
  ],
  // Dos anclas: el capítulo 20 del manhwa cae justo en el 28 de la novela.
  'equivalencias?novela_slug=eq.monte-hua': [
    { capitulo_manhwa: 1, capitulo_novela: 1 },
    { capitulo_manhwa: 20, capitulo_novela: 28 },
  ],
};

// Gana la clave MÁS LARGA que encaje, no la primera: si no, la consulta con la
// exclusión de link-out coincidiría también con la clave sin ella y el test
// pasaría aunque el filtro no se estuviera aplicando.
// `/fuentes-enlace.json` lo genera el build con el mismo código que la ficha;
// aquí se sirve fijo. Es la ÚNICA fuente de verdad de qué fuentes no listan
// capítulos: la función ya no lo deduce de `n_caps`, que mentía.
globalThis.fetch = (async (entrada: any) => {
  if (String(entrada).endsWith('/fuentes-enlace.json')) return Response.json(['f3']);
  const consulta = String(entrada).split('/rest/v1/')[1];
  const clave = Object.keys(FILAS)
    .filter((k) => consulta.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return Response.json(clave ? FILAS[clave] : []);
}) as typeof fetch;

const env = { PUBLIC_SUPABASE_URL: 'https://db.test', PUBLIC_SUPABASE_ANON_KEY: 'anon' };
const pedir = (slug: string, capitulo: string) =>
  onRequest({
    request: new Request(`https://mtn.test/novela/${slug}/${capitulo}`),
    params: { slug, capitulo },
    env,
    next: async () => new Response('ESTATICA', { status: 299 }),
  });

// Lo que NO es un capítulo sigue su camino: /equivalencia es una página del
// despliegue y la función no debe secuestrarla.
assert.equal((await pedir('monte-hua', 'equivalencia')).status, 299, 'equivalencia cae en next()');
assert.equal((await pedir('monte-hua', 'capitulo-cero')).status, 299, 'sin número, next()');

// Sin credenciales tampoco secuestra nada (un clon del repo no rompe).
const sinEnv = await onRequest({
  request: new Request('https://mtn.test/novela/monte-hua/capitulo-20'),
  params: { slug: 'monte-hua', capitulo: 'capitulo-20' },
  env: {},
  next: async () => new Response('ESTATICA', { status: 299 }),
});
assert.equal(sinEnv.status, 299, 'sin Supabase, next()');

const ok = await pedir('monte-hua', 'capitulo-20');
const html = await ok.text();
assert.equal(ok.status, 200);
assert.match(html, /<title>Regreso de la Secta del Monte Hua Capítulo 20 — dónde leerlo \| Return of the Mount Hua Sect Chapter 20<\/title>/);
assert.match(html, /<h1>Regreso de la Secta del Monte Hua — Capítulo 20<\/h1>/);
assert.match(html, /rel="canonical" href="https:\/\/mtn\.test\/novela\/monte-hua\/capitulo-20"/);
assert.ok(html.includes('ScanA') && html.includes('ScanB'), 'las dos fuentes');
assert.ok(html.includes('Manhwa en Español') && html.includes('Novela en Inglés'), 'tipo e idioma');
assert.match(html, /capitulo-19">← Capítulo 19/, 'anterior');
assert.match(html, /capitulo-21">Capítulo 21 →/, 'siguiente');
assert.match(html, /<strong>capítulo 28<\/strong>/, 'la novela va por el 28 cuando el manhwa va por el 20');
assert.ok(html.includes('화산귀환'), 'los otros nombres, para que se encuentre por ellos');
assert.ok(!html.includes('noindex'), 'un capítulo que existe SÍ se indexa');

// Un capítulo que no existe: 404 de verdad. Un 200 vacío a esta escala hunde
// la confianza del dominio entero.
const no = await pedir('monte-hua', 'capitulo-999');
const htmlNo = await no.text();
assert.equal(no.status, 404);
assert.match(htmlNo, /name="robots" content="noindex/);
assert.ok(htmlNo.includes('/novela/monte-hua'), 'ofrece la ficha');

// El caso Olympus: su fila dice `numero: 18` pero enlaza a la serie, no al
// capítulo 18. Esa página no debe existir —ni con 200, ni en el sitemap—.
const linkOut = await pedir('monte-hua', 'capitulo-18');
assert.equal(linkOut.status, 404, 'una fuente link-out no crea página de capítulo');

// `capitulo-007` es la misma página que `capitulo-7`. Sin el 301 serían dos
// URLs con el mismo contenido, multiplicado por 200.000.
const cero = await pedir('monte-hua', 'capitulo-0020');
assert.equal(cero.status, 301, 'los ceros a la izquierda redirigen');
assert.equal(cero.headers.get('location'), 'https://mtn.test/novela/monte-hua/capitulo-20');

// Un número absurdo no debe gastar cuatro consultas para acabar en el mismo 404.
assert.equal((await pedir('monte-hua', 'capitulo-99999999999')).status, 299, 'techo de 5 cifras');

// Compartible: sin og:image ni Pinterest ni ninguna red enseña vista previa.
assert.match(html, /property="og:image" content="https:\/\/mtn\.test\/portada\/monte-hua\.jpg"/);

console.log('OK: página de capítulo en el edge');
