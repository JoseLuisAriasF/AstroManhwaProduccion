/**
 * Comprueba el visor SIN red: `fetch` devuelve respuestas fijas y
 * `HTMLRewriter` —que es un global del runtime de Cloudflare y no existe en
 * Node— se sustituye por un doble que apunta qué se registró.
 *
 * Lo que se verifica es lo que se rompe en silencio: que no se pueda pedir un
 * dominio de fuera, que las cabeceras que impiden mostrar la página se caigan,
 * que el <base> apunte a la URL FINAL tras los redirects, y que una fuente
 * caída dé una página con salida en vez de un marco en blanco.
 *
 *   node --experimental-strip-types functions/leer.test.ts
 */
import assert from 'node:assert/strict';

/** Doble de HTMLRewriter: no transforma, solo anota. */
const registrado: Record<string, any> = {};
(globalThis as any).HTMLRewriter = class {
  on(selector: string, handlers: any) {
    registrado[selector] = handlers;
    return this;
  }
  transform(r: Response) {
    return r;
  }
};

let pedido: { url: string; init: any } | null = null;
let respuesta: Response = new Response('', { status: 200 });
globalThis.fetch = (async (u: any, init: any) => {
  pedido = { url: String(u), init };
  return respuesta;
}) as typeof fetch;

const { onRequest } = await import('./leer.ts');
const pedir = (u: string) =>
  onRequest({ request: new Request(`https://mtn.test/leer?u=${encodeURIComponent(u)}`) });

// ── La puerta ────────────────────────────────────────────────────────────────
for (const malo of ['https://example.com/x', 'file:///etc/passwd', '']) {
  const r = await pedir(malo);
  assert.equal(r.status, 400, `no se proxea ${malo || '(vacío)'}`);
}
assert.equal(pedido, null, 'lo rechazado ni siquiera se pide');

// ── El camino bueno ──────────────────────────────────────────────────────────
const html = (cuerpo: string, cabeceras: Record<string, string> = {}, url?: string) => {
  const r = new Response(cuerpo, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...cabeceras },
  });
  if (url) Object.defineProperty(r, 'url', { value: url });
  return r;
};

respuesta = html('<html><head><base href="/"></head><body>cap</body></html>', {
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
  'Set-Cookie': 'sesion=abc',
  'X-Otra': 'se-conserva',
  // Estas dos describen el cuerpo ORIGINAL: copiarlas sobre uno ya
  // descomprimido y reescrito da una respuesta corrupta.
  'Content-Encoding': 'gzip',
  'Content-Length': '999',
});
const ok = await pedir('https://imperiomanhua.com/manga/x/capitulo-1/');
assert.equal(ok.status, 200);
assert.equal(pedido!.url, 'https://imperiomanhua.com/manga/x/capitulo-1/');
assert.ok(/Chrome/.test(pedido!.init.headers['User-Agent']), 'sin UA varias scans dan 403');

for (const fuera of ['x-frame-options', 'content-security-policy', 'set-cookie', 'content-encoding', 'content-length']) {
  assert.equal(ok.headers.get(fuera), null, `${fuera} NO se copia`);
}
assert.equal(ok.headers.get('x-otra'), 'se-conserva', 'lo demás sí');
assert.match(ok.headers.get('cache-control') ?? '', /s-maxage=\d+/, 'se cachea en el edge');
assert.match(ok.headers.get('x-robots-tag') ?? '', /noindex/, 'la página buena es /capitulo-N');

// El <base> tiene que ser la URL FINAL: con `redirect: follow` la de partida
// puede no ser la que sirvió el HTML, y las rutas relativas irían al sitio malo.
respuesta = html('<html><head></head><body>cap</body></html>', {}, 'https://leemiau.com/final/');
await pedir('https://leemiau.com/inicial/');
let inyectado = '';
registrado['head'].element({ prepend: (h: string) => (inyectado = h) });
assert.equal(inyectado, '<base href="https://leemiau.com/final/">');
// Y el <base> que trajera la página se quita: uno con href="/" rompe sus rutas.
let quitado = false;
registrado['base'].element({ remove: () => (quitado = true) });
assert.ok(quitado, 'el <base> de la fuente se elimina');

// Lo que no es HTML pasa tal cual, sin tocar el cuerpo.
respuesta = new Response('bytes', { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
const img = await pedir('https://leemiau.com/x.jpg');
assert.equal(img.headers.get('content-type'), 'image/jpeg');

// ── Cuando la fuente no colabora ─────────────────────────────────────────────
respuesta = new Response('no', { status: 403 });
const caida = await pedir('https://daotranslate.com/x');
assert.equal(caida.status, 502);
const cuerpo = await caida.text();
assert.match(cuerpo, /daotranslate\.com/, 'dice de quién es el problema');
assert.match(cuerpo, /Abrir en/, 'y ofrece la salida: un marco en blanco es lo peor');

globalThis.fetch = (async () => {
  throw new Error('red caída');
}) as typeof fetch;
assert.equal((await pedir('https://leemiau.com/x')).status, 502, 'un fallo de red no revienta');

console.log('OK: el visor de capítulos');
