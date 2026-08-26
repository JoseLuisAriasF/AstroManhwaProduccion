/**
 * Check offline del pipeline de indexado: numeración, slug y los dos
 * adaptadores de tema. `fetch` se sustituye por HTML fijo, así que no toca la
 * red y no depende de que los sitios de origen estén arriba hoy.
 *
 *   npm run test:scrapear
 */
import assert from 'node:assert/strict';
import { PLATAFORMAS, numeroDe, slugify, utiles } from './plataformas.mjs';

// ── numeración ───────────────────────────────────────────────────────────────
assert.equal(numeroDe('Chapter 1938'), 1938);
assert.equal(numeroDe('Special Spinoff. Chapter 57 (Hiatus)'), 57);
assert.equal(numeroDe('Capítulo 12 – El regreso'), 12);
assert.equal(numeroDe('Ch. 7'), 7);
assert.equal(numeroDe('Capítulo 517.5'), 517, 'los .5 truncan al entero de abajo');
assert.equal(numeroDe('https://sitio.com/obra-capitulo-45/'), 45, 'cae a la URL');
assert.equal(numeroDe('Prólogo'), null);
assert.equal(numeroDe(null), null);

// ── slug ─────────────────────────────────────────────────────────────────────
assert.equal(slugify('Regreso de la Secta del Monte Huá!'), 'regreso-de-la-secta-del-monte-hua');
assert.equal(slugify('  ¿Y si...?  '), 'y-si');

// ── adaptadores, con la red simulada ─────────────────────────────────────────
const paginas = {
  'https://x.test/robots.txt': 'User-agent: *\nDisallow: /wp-admin/',
  'https://x.test/manga/page/1/': `<div class="page-item-detail">
      <div class="item-thumb"><a href="/manga/obra-uno/"><img
        src="data:image/svg+xml,vacio" data-src="https://x.test/portada.webp"></a></div>
      <div class="post-title"><h3><a href="/manga/obra-uno/">Obra Uno</a></h3></div>
    </div>`,
  'https://x.test/manga/obra-uno/ajax/chapters/': `<ul>
      <li class="wp-manga-chapter"><a href="/manga/obra-uno/capitulo-2/">Capítulo 2</a>
        <span class="chapter-release-date">21 agosto, 2026</span></li>
      <li class="wp-manga-chapter"><a href="/manga/obra-uno/capitulo-1/">Capítulo 1</a></li>
    </ul>`,
  'https://x.test/lista/': `<div class="listupd"><div class="bs"><div class="bsx">
      <a href="https://x.test/manga/dos/" title="Obra Dos"><img data-lazy-src="https://x.test/2.webp"></a>
    </div></div></div>`,
  'https://x.test/manga/dos/': `<div id="chapterlist"><ul>
      <li data-num="33"><a href="https://x.test/dos-capitulo-33/" data-chapter-title="Capítulo 33"></a>
        <span class="chapterdate">1 enero, 2026</span></li>
    </ul></div>`,
};

globalThis.fetch = async (url) =>
  url in paginas
    ? { ok: true, status: 200, text: async () => paginas[url] }
    : { ok: false, status: 404, text: async () => '' };

const madara = await PLATAFORMAS.madara.series('https://x.test/manga/page/1/');
assert.equal(madara.length, 1);
assert.deepEqual(madara[0], {
  titulo: 'Obra Uno',
  url: 'https://x.test/manga/obra-uno/',
  portadaUrl: 'https://x.test/portada.webp', // no el placeholder en data:
});

const caps = await PLATAFORMAS.madara.capitulos('https://x.test/manga/obra-uno/');
assert.equal(caps.length, 2);
assert.equal(caps[0].numero, 2);
assert.equal(caps[0].fecha_texto, '21 agosto, 2026');
assert.equal(caps[1].fecha_texto, null);

const mr = await PLATAFORMAS.mangareader.series('https://x.test/lista/');
assert.deepEqual(mr[0], {
  titulo: 'Obra Dos',
  url: 'https://x.test/manga/dos/',
  portadaUrl: 'https://x.test/2.webp',
});

const caps2 = await PLATAFORMAS.mangareader.capitulos('https://x.test/manga/dos/');
assert.equal(caps2[0].numero, 33);
assert.equal(caps2[0].titulo, 'Capítulo 33', 'título desde data-chapter-title');

// ── robots.txt manda ─────────────────────────────────────────────────────────
await assert.rejects(
  () => PLATAFORMAS.madara.series('https://x.test/wp-admin/algo'),
  /robots/,
  'una ruta prohibida no se toca',
);

// ── basura fuera ─────────────────────────────────────────────────────────────
assert.deepEqual(utiles([{ titulo: '', url: 'u' }, { titulo: 't', url: null }, { titulo: 't', url: 'u' }]), [
  { titulo: 't', url: 'u' },
]);

console.log('ok');
