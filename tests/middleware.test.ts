/**
 *   node --experimental-strip-types tests/middleware.test.ts
 */
import assert from 'node:assert/strict';
import { onRequest, reparar } from '../functions/_middleware.ts';

assert.equal(reparar('/pt/novela/return-of-the-mount-hua/capitulo-1'), '/novela/return-of-the-mount-hua/capitulo-1');
assert.equal(reparar('/de/novela/release-that-witch/equivalencia/'), '/novela/release-that-witch/equivalencia/');
assert.equal(reparar('/en/novela/que-alguien-detenga-al-papa/'), '/novela/que-alguien-detenga-al-papa/');
assert.equal(reparar('/fr'), '/', 'la portada de un idioma muerto');
assert.equal(
  reparar('/novela/the-great-mage-returns-after-4000-years-capitulo-86'),
  '/novela/the-great-mage-returns-after-4000-years/capitulo-86',
);
assert.equal(reparar('/novela/no-existe/'), null, 'un 404 sin arreglo se queda en 404');
assert.equal(reparar('/entrevista/'), null, '"en" dentro de otra palabra no es un prefijo');

const pedir = (ruta: string, status: number) =>
  onRequest({
    request: new Request(`https://www.manhwatonovel.com${ruta}`),
    next: async () => new Response('x', { status }),
  });

assert.equal((await pedir('/en/novela/x/', 200)).status, 200, 'lo que existe no se toca');
const r = await pedir('/pt/novela/x/?a=1', 404);
assert.equal(r.status, 301);
assert.equal(r.headers.get('location'), 'https://www.manhwatonovel.com/novela/x/?a=1');
assert.equal((await pedir('/novela/nada/', 404)).status, 404);

console.log('OK: middleware');
