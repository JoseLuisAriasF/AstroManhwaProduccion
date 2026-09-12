/**
 * Check de la puerta del visor. Es lo único que separa `/leer?u=` de ser un
 * proxy abierto, así que lo que se prueba son los intentos de colarse.
 *
 * Correr con: node --experimental-strip-types src/lib/fuentes.test.ts
 */
import assert from 'node:assert/strict';
import { abreEnVisor, esFuenteDelCatalogo, urlDeLectura } from './fuentes.ts';

// Lo que sí: los dominios del catálogo, con y sin www, y sus subdominios.
assert.equal(esFuenteDelCatalogo('https://leemiau.com/x-capitulo-1/'), true);
assert.equal(esFuenteDelCatalogo('https://www.leemiau.com/x'), true);
assert.equal(esFuenteDelCatalogo('https://cdn.leemiau.com/x'), true);
assert.equal(esFuenteDelCatalogo('https://LEEMIAU.com/x'), true, 'mayúsculas');
assert.equal(esFuenteDelCatalogo('https://imperiomanhua.com/manga/x/capitulo-1/'), true);
assert.equal(esFuenteDelCatalogo('https://samurai.j5z.xyz/son/x/capitulo-46/'), true);

// Lo que no. Cada línea es una forma real de abusar de un proxy.
assert.equal(esFuenteDelCatalogo('https://example.com/'), false, 'un dominio cualquiera');
assert.equal(
  esFuenteDelCatalogo('https://noleemiau.com/x'),
  false,
  'termina igual pero NO es el dominio: sin el punto del endsWith, se registra y entra',
);
assert.equal(esFuenteDelCatalogo('https://leemiau.com.evil.test/x'), false, 'el sufijo al revés');
assert.equal(esFuenteDelCatalogo('file:///etc/passwd'), false, 'file:');
assert.equal(esFuenteDelCatalogo('data:text/html,<h1>hola'), false, 'data:');
// La red interna de Cloudflare no se alcanza por esto, pero un proxy que acepta
// cualquier esquema es media vulnerabilidad ya hecha.
assert.equal(esFuenteDelCatalogo('http://169.254.169.254/'), false, 'metadatos de la nube');
assert.equal(esFuenteDelCatalogo(''), false);
assert.equal(esFuenteDelCatalogo('no-es-una-url'), false);

// La URL del visor: el enlace de la scan lleva ?, & y # de sobra.
assert.equal(
  urlDeLectura('https://leemiau.com/a?b=1&c=2#d'),
  '/leer?u=https%3A%2F%2Fleemiau.com%2Fa%3Fb%3D1%26c%3D2%23d',
);

// El visor solo se abre para las fuentes que renderizan HTML de verdad. Las
// apps JS (olympus, mangadex…) y las que dan 403 abren en pestaña: del catálogo
// sí, pero `abreEnVisor` las deja fuera.
assert.equal(abreEnVisor('https://imperiomanhua.com/manga/x/capitulo-1/'), true, 'HTML normal: visor');
assert.equal(abreEnVisor('https://anslid.com/novela/x/capitulo-1/'), true);
// leemiau va al visor aunque blinde su página: /leer le arma un lector propio
// con las imágenes (ver `lectorPropio` en functions/leer.ts).
assert.equal(abreEnVisor('https://leemiau.com/x-capitulo-1/'), true, 'con lector propio: visor');
assert.equal(abreEnVisor('https://olympusxyz.com/series/x'), false, 'Nuxt: en blanco');
assert.equal(abreEnVisor('https://www.webtoons.com/en/x/list?title_no=1'), false, 'con www');
assert.equal(abreEnVisor('https://mangadex.org/chapter/abc'), false);
assert.equal(abreEnVisor('https://daotranslate.com/x/'), false, 'Cloudflare 403');
assert.equal(abreEnVisor('https://example.com/x'), false, 'fuera del catálogo, ni visor ni nada');

console.log('OK: la puerta del visor');
