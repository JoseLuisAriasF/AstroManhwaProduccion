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

const { onRequest } = await import('../functions/leer.ts');
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

for (const fuera of ['x-frame-options', 'set-cookie', 'content-encoding', 'content-length']) {
  assert.equal(ok.headers.get(fuera), null, `${fuera} NO se copia`);
}
assert.equal(ok.headers.get('x-otra'), 'se-conserva', 'lo demás sí');

// ── La publicidad ────────────────────────────────────────────────────────────
// La CSP de la fuente se cae y la NUESTRA ocupa su sitio: el JavaScript solo
// puede venir de la fuente, así que AdSense y los popunders no llegan a cargar
// ni aunque los inyecte en caliente el JS de la propia scan —que es justo lo
// que ninguna limpieza del HTML puede pillar—.
const csp = ok.headers.get('content-security-policy') ?? '';
assert.ok(!csp.includes('frame-ancestors'), 'la CSP de la fuente NO se copia');
assert.match(csp, /script-src [^;]*https:\/\/imperiomanhua\.com/, 'el JS de la fuente, sí');
assert.match(csp, /frame-src [^;]*imperiomanhua\.com/, 'los marcos, solo de la fuente');
assert.ok(!/frame-src [^;]*\*[^.]/.test(csp), 'un <iframe> ajeno en un capítulo es un anuncio');
assert.match(csp, /img-src \*/, 'las imágenes, de donde sea: son el capítulo');

// Y la publicidad que ya no necesita script: las subastas y el perfilado que
// corre el propio navegador (Topics, Protected Audience…). Una CSP no las ve.
const permisos = ok.headers.get('permissions-policy') ?? '';
for (const api of ['browsing-topics', 'run-ad-auction', 'attribution-reporting', 'shared-storage']) {
  assert.match(permisos, new RegExp(`${api}=\\(\\)`), `${api} apagado`);
}
assert.match(ok.headers.get('cache-control') ?? '', /s-maxage=\d+/, 'se cachea en el edge');
assert.match(ok.headers.get('x-robots-tag') ?? '', /noindex/, 'la página buena es /capitulo-N');

// El <base> tiene que ser la URL FINAL: con `redirect: follow` la de partida
// puede no ser la que sirvió el HTML, y las rutas relativas irían al sitio malo.
respuesta = html('<html><head></head><body>cap</body></html>', {}, 'https://leemiau.com/final/');
await pedir('https://leemiau.com/inicial/');
let inyectado = '';
let anexado = '';
registrado['head'].element({
  prepend: (h: string) => (inyectado = h),
  append: (h: string) => (anexado = h),
});
assert.match(inyectado, /^<base href="https:\/\/leemiau\.com\/final\/">/);
// El remiendo del almacenamiento va con el <base>, y ANTES que cualquier script
// de la scan: si uno suyo corre primero, ya ha reventado.
assert.match(inyectado, /localStorage/, 'el remiendo se inyecta');
assert.match(anexado, /adsbygoogle[^{]*\{display:none/, 'y el hueco del anuncio no empuja el capítulo');
// Y el <base> que trajera la página se quita: uno con href="/" rompe sus rutas.
let quitado = false;
registrado['base'].element({ remove: () => (quitado = true) });
assert.ok(quitado, 'el <base> de la fuente se elimina');

// Los huecos que dejan los anuncios bloqueados también se van: si no, siguen
// empujando el capítulo hacia abajo. El <iframe> PROPIO de la fuente se queda.
let huecos = 0;
const marco = (src: string | null) =>
  registrado['iframe'].element({ getAttribute: () => src, remove: () => huecos++ });
registrado['ins.adsbygoogle'].element({ remove: () => huecos++ });
marco('https://ads.example.com/x');
assert.equal(huecos, 2, 'el bloque de AdSense y el marco ajeno, fuera');
marco('/embed/player.html');
marco('https://leemiau.com/embed');
assert.equal(huecos, 2, 'lo que sirve la propia fuente se respeta');
marco(null);
assert.equal(huecos, 3, 'un <iframe> sin src es el hueco que rellena un script');

// ── Fuentes con escudo: su HTML no se sirve, se rearma ───────────────────────
// leemiau manda las <img> en blanco y la URL real en `data-lm-orig-src`; su JS
// solo las pinta en su dominio. Así que se escribe un lector NUESTRO con las
// imágenes: su página —y su escudo— no llegan a existir.
respuesta = html(
  `<html><head><title>Obra — Capítulo 1</title></head><body>
   <img src="data:image/gif;base64,blank" data-lm-orig-src="https://leemiau.com/wp-content/uploads/p1.webp">
   <img src="data:image/gif;base64,blank" data-lm-orig-src="https://leemiau.com/wp-content/uploads/p2.webp">
   <img data-lm-orig-src="https://leemiau.com/wp-content/uploads/p1.webp">
   <img data-lm-orig-src="https://leemiau.com/wp-content/themes/logo.svg">
   <script>ts_reader_control.shield();</script></body></html>`,
  {},
  'https://leemiau.com/obra-capitulo-1/',
);
const lector = await pedir('https://leemiau.com/obra-capitulo-1/');
assert.equal(lector.status, 200);
const pagina = await lector.text();
assert.match(pagina, /src="https:\/\/leemiau\.com\/wp-content\/uploads\/p1\.webp"/, 'la página 1');
assert.match(pagina, /src="https:\/\/leemiau\.com\/wp-content\/uploads\/p2\.webp"/, 'y la 2');
assert.equal(pagina.match(/uploads\/p1\.webp/g)?.length, 1, 'sin repetir');
assert.ok(!pagina.includes('logo.svg'), 'lo que no es imagen de página, fuera');
assert.ok(!pagina.includes('ts_reader_control'), 'su JS no llega a existir: no hay escudo');
assert.match(pagina, /Capítulo 1/, 'conserva el título de la fuente');
// La CSP más estricta del sitio: esta página no ejecuta nada.
assert.match(lector.headers.get('content-security-policy') ?? '', /default-src 'none'/);
assert.equal(lector.headers.get('referrer-policy'), 'no-referrer', 'o las imágenes dan 403');

// Si su anti-bot devuelve una página sin capítulo, se sigue por el camino
// normal: su HTML es mejor que un lector vacío.
respuesta = html('<html><head></head><body>sin capitulo</body></html>', {}, 'https://leemiau.com/x/');
const sinPaginas = await pedir('https://leemiau.com/x/');
assert.equal(sinPaginas.status, 200);
assert.match(sinPaginas.headers.get('content-security-policy') ?? '', /script-src/, 'CSP normal');

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
