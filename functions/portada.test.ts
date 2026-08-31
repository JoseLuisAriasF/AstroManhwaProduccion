/**
 * Comprueba el proxy de portadas SIN red: `fetch` se sustituye por respuestas
 * fijas. Lo que se verifica es lo que se rompe en silencio —que la extensión se
 * quite del slug, que una fuente caída pase a la siguiente, y que un cartel de
 * "no hotlinking" (200 pero no es imagen) no se sirva como portada—.
 *
 *   node --experimental-strip-types functions/portada.test.ts
 */
import assert from 'node:assert/strict';
import { onRequest } from './portada/[slug].ts';

const MAPA = {
  buena: ['https://scan-a.test/ok.jpg'],
  'segunda-fuente': ['https://scan-a.test/rota.jpg', 'https://scan-b.test/ok.jpg'],
  'todas-rotas': ['https://scan-a.test/rota.jpg', 'https://scan-a.test/cartel.html'],
};

const imagen = () => new Response('bytes', { headers: { 'Content-Type': 'image/jpeg' } });

globalThis.fetch = (async (entrada: any) => {
  const u = String(entrada);
  if (u.endsWith('/portadas.json')) return Response.json(MAPA);
  if (u.includes('/ok.jpg')) return imagen();
  // El vicio real: 200 y HTML. Sin mirar el content-type se serviría un cartel.
  if (u.includes('/cartel.html')) return new Response('<h1>no hotlinking</h1>', { headers: { 'Content-Type': 'text/html' } });
  return new Response('', { status: 404 });
}) as typeof fetch;

const pedir = (slug: string) =>
  onRequest({
    request: new Request(`https://mtn.test/portada/${slug}`),
    params: { slug },
  });

const r1 = await pedir('buena.jpg');
assert.equal(r1.status, 200, 'la portada buena se sirve');
assert.equal(r1.headers.get('content-type'), 'image/jpeg');
assert.match(r1.headers.get('cdn-cache-control') ?? '', /s-maxage/, 'sin caché el proxy no sale gratis');

const r2 = await pedir('segunda-fuente.webp');
assert.equal(r2.status, 200, 'la primera fuente 404: debe caer a la segunda');
assert.equal(r2.headers.get('x-portada-origen'), 'scan-b.test');

const r3 = await pedir('todas-rotas.jpg');
assert.equal(r3.status, 302, 'ninguna sirve: placeholder, nunca un cartel HTML');
assert.match(r3.headers.get('location') ?? '', /sin-portada\.svg$/);

const r4 = await pedir('no-existe.jpg');
assert.equal(r4.status, 302, 'slug fuera del catálogo: no se proxea nada');

console.log('portada: 4 casos ok');
