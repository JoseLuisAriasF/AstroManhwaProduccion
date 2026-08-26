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

// ── MangaDex: offset, idioma, slug estable y capítulos duplicados ───────────
const obra = {
  id: '11111111-2222-3333-4444-555555555555',
  attributes: {
    title: { 'ko-ro': 'Jeonjijeok' },
    altTitles: [{ en: "Omniscient Reader's Viewpoint" }, { es: 'Lector omnisciente' }],
    status: 'ongoing',
    tags: [{ attributes: { group: 'genre', name: { en: 'Action', es: 'Acción' } } }],
  },
  relationships: [{ type: 'cover_art', attributes: { fileName: 'tapa.jpg' } }],
};

const json = {
  'https://api.mangadex.org/robots.txt': 'User-agent: *\nDisallow: /at-home/',
  // offset=2 en la plantilla (página 2) con limit=100 → offset real 100.
  'https://api.mangadex.org/manga?limit=100&offset=100': { data: [obra], total: 1 },
  // pt del sitio tiene que salir como pt-br al hablar con la API.
  'https://api.mangadex.org/manga/11111111-2222-3333-4444-555555555555/feed?limit=500&offset=0&translatedLanguage[]=pt-br&order[chapter]=desc&includes[]=scanlation_group': {
    total: 3,
    data: [
      { id: 'c1', attributes: { chapter: '12', title: 'Doce', publishAt: '2026-01-02T00:00:00Z' } },
      // Mismo capítulo, otro grupo de scanlation: no debe salir dos veces.
      { id: 'c2', attributes: { chapter: '12', title: 'Doce (otro grupo)', publishAt: '2026-01-01T00:00:00Z' } },
      { id: 'c3', attributes: { chapter: '11.5', title: null, publishAt: '2025-12-30T00:00:00Z' } },
    ],
  },
};

globalThis.fetch = async (url) => {
  if (url in paginas) return { ok: true, status: 200, text: async () => paginas[url] };
  if (url in json)
    return { ok: true, status: 200, text: async () => JSON.stringify(json[url]), json: async () => json[url] };
  return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
};

const md = await PLATAFORMAS.mangadex.series(
  'https://api.mangadex.org/manga?limit=100&offset={page}'.replace('{page}', '2'),
  { idioma: 'es' },
);
assert.equal(md.length, 1);
assert.equal(md[0].titulo, 'Lector omnisciente', 'título en el idioma del sitio');
assert.equal(slugify(md[0].slugBase), 'omniscient-reader-s-viewpoint', 'el slug sale del inglés, no del es');
assert.equal(md[0].portadaUrl, 'https://uploads.mangadex.org/covers/' + obra.id + '/tapa.jpg.256.jpg');
assert.equal(md[0].estado, 'En emisión');
assert.deepEqual(md[0].categorias, ['Acción']);

const mdCaps = await PLATAFORMAS.mangadex.capitulos(`https://mangadex.org/title/${obra.id}`, { idioma: 'pt' });
assert.equal(mdCaps.length, 2, 'el capítulo 12 duplicado se colapsa en uno');
assert.equal(mdCaps[0].numero, 12);
assert.equal(mdCaps[1].numero, 11, 'el 11.5 trunca a 11');
assert.equal(mdCaps[1].titulo, 'Capítulo 11.5', 'sin título propio, se compone uno');
assert.equal(mdCaps[0].fecha_texto, '2026-01-02');

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
