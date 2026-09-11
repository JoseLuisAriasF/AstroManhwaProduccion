/**
 * Comprueba el proxy de portadas SIN red: `fetch` se sustituye por respuestas
 * fijas. Lo que se verifica es lo que se rompe en silencio —que la extensión se
 * quite del slug, que una fuente caída pase a la siguiente, que un cartel de
 * "no hotlinking" (200 pero no es imagen) no se sirva como portada, y que los
 * CDN con protección reciban el `Referer` que piden—.
 *
 *   node --experimental-strip-types functions/portada.test.ts
 */
import assert from 'node:assert/strict';
import { onRequest } from '../functions/portada/[slug].ts';

const MAPA = {
  buena: ['https://scan-a.test/ok.jpg'],
  'segunda-fuente': ['https://scan-a.test/rota.jpg', 'https://scan-b.test/ok.jpg'],
  'todas-rotas': ['https://scan-a.test/rota.jpg', 'https://scan-a.test/cartel.html'],
  // El caso real: en producción se llevaba el 32 % de las portadas rotas.
  hotlink: ['https://img2mw.xyz/manhwas/x/cover.webp'],
};

const imagen = () => new Response('bytes', { headers: { 'Content-Type': 'image/jpeg' } });
/** Qué `Referer` se mandó a cada host. El resto NO debe llevar ninguno. */
const referers = new Map<string, string | undefined>();

globalThis.fetch = (async (entrada: any, init: any) => {
  const u = String(entrada);
  if (u.endsWith('/portadas.json')) return Response.json(MAPA);
  const host = new URL(u).hostname;
  const ref = init?.headers?.Referer;
  referers.set(host, ref);
  // img*mw.xyz solo sirve la imagen al sitio dueño del CDN; a cualquier otro,
  // 403 con HTML. Es literalmente lo que hace en producción.
  if (host.endsWith('mw.xyz'))
    return ref === 'https://manhwaweb.com/'
      ? imagen()
      : new Response('denegado', { status: 403, headers: { 'Content-Type': 'text/html' } });
  if (u.includes('/ok.jpg')) return imagen();
  // El otro vicio: 200 y HTML. Sin mirar el content-type se serviría un cartel.
  if (u.includes('/cartel.html'))
    return new Response('<h1>no hotlinking</h1>', { headers: { 'Content-Type': 'text/html' } });
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

const r5 = await pedir('hotlink.jpg');
assert.equal(r5.status, 200, 'un CDN con hotlinking necesita el Referer de su sitio');
assert.equal(referers.get('img2mw.xyz'), 'https://manhwaweb.com/');

// Medido en 12 hosts (lezhin, mangadex, leemiau, olympus, wp.com…): el Referer
// da igual. Mandar uno inventado solo puede romper, así que no se manda.
assert.equal(referers.get('scan-a.test'), undefined, 'al resto no se le manda Referer');
assert.equal(referers.get('scan-b.test'), undefined);

console.log('portada: 6 casos ok');
