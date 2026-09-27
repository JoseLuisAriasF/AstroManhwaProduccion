/**
 *   node --experimental-strip-types tests/middleware.test.ts
 */
import assert from 'node:assert/strict';
import { onRequest, reparar, rutaFusionada } from '../functions/_middleware.ts';

assert.equal(reparar('/pt/novela/return-of-the-mount-hua/capitulo-1'), '/novela/return-of-the-mount-hua/capitulo-1');
assert.equal(reparar('/de/novela/release-that-witch/equivalencia/'), '/novela/release-that-witch/equivalencia/');
assert.equal(reparar('/en/novela/que-alguien-detenga-al-papa/'), '/novela/que-alguien-detenga-al-papa/');
assert.equal(reparar('/fr'), '/', 'la portada de un idioma muerto');
assert.equal(
  reparar('/novela/the-great-mage-returns-after-4000-years-capitulo-86'),
  '/novela/the-great-mage-returns-after-4000-years/capitulo-86',
);
assert.equal(reparar('/categoria/martial-arts/'), '/categoria/artes-marciales/', 'género con slug inglés viejo');
assert.equal(reparar('/categoria/inventada/'), null);
assert.equal(reparar('/novela/no-existe/'), null, 'un 404 sin arreglo se queda en 404');
assert.equal(reparar('/entrevista/'), null, '"en" dentro de otra palabra no es un prefijo');

const fus = { 'contra-los-dioses': 'against-the-gods' };
assert.equal(rutaFusionada('/novela/contra-los-dioses/capitulo-1481', fus), '/novela/against-the-gods/capitulo-1481');
assert.equal(rutaFusionada('/novela/contra-los-dioses', fus), '/novela/against-the-gods/');
assert.equal(rutaFusionada('/en/novela/contra-los-dioses/', fus), '/en/novela/against-the-gods/');
assert.equal(rutaFusionada('/novela/otra/', fus), null);

// El middleware comprueba el destino antes de redirigir: aquí la "red" es un
// mapa de rutas que existen. Lo que no está, da 404.
const existen = new Set(['/novela/x/', '/novela/against-the-gods/capitulo-1481']);
globalThis.fetch = (async (u: string) => {
  const url = new URL(u);
  if (url.pathname === '/redirecciones.json') return new Response(JSON.stringify(fus));
  const res = new Response('x', { status: existen.has(url.pathname) ? 200 : 404 });
  Object.defineProperty(res, 'url', { value: u });
  return res;
}) as typeof fetch;

const pedir = (ruta: string, status: number) =>
  onRequest({
    request: new Request(`https://www.manhwatonovel.com${ruta}`),
    next: async () => new Response('x', { status }),
  });

assert.equal((await pedir('/en/novela/x/', 200)).status, 200, 'lo que existe no se toca');
assert.equal((await pedir('/novela/pasion/', 200)).status, 410, 'obra retirada devuelve 410');
assert.equal((await pedir('/en/novela/pasion/capitulo-1', 200)).status, 410, 'capítulo de obra retirada devuelve 410');
assert.equal((await pedir('/portada/pasion.jpg', 200)).status, 410, 'portada de obra retirada devuelve 410');
const r = await pedir('/pt/novela/x/?a=1', 404);
assert.equal(r.status, 301);
assert.equal(r.headers.get('location'), 'https://www.manhwatonovel.com/novela/x/?a=1');
assert.equal((await pedir('/novela/nada/', 404)).status, 404);
const f = await pedir('/novela/contra-los-dioses-capitulo-1481', 404);
assert.equal(f.headers.get('location'), 'https://www.manhwatonovel.com/novela/against-the-gods/capitulo-1481', 'formato viejo + fusión, en un salto');
assert.equal((await pedir('/categoria/erotica/', 404)).status, 404, 'no se redirige a una página que no existe');

console.log('OK: middleware');
