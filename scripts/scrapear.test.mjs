/**
 * Check offline del pipeline de indexado: numeración, slug y los dos
 * adaptadores de tema. `fetch` se sustituye por HTML fijo, así que no toca la
 * red y no depende de que los sitios de origen estén arriba hoy.
 *
 *   npm run test:scrapear
 */
import assert from 'node:assert/strict';
import { PLATAFORMAS, esEnlace, numeroDe, slugify, utiles } from './plataformas.mjs';

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
  // Tema HIJO de Madara (madara-child-mk): la tarjeta ES el <a> y el titulo
  // vive en su atributo `title`. Sin `.page-item-detail` a la vista.
  'https://x.test/manga/page/2/': `<div class="agrid">
      <a class="acard" href="/manga/obra-hija/" title="Obra Hija">
        <img class="ac-cover" src="https://x.test/hija.webp" alt="Obra Hija"></a>
    </div>`,
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

// El tema hijo: mismo adaptador, la rejilla nueva solo se mira si la clasica
// no dio nada. Es lo que destraba imperiomanhua.com y cualquier otro fork.
const hija = await PLATAFORMAS.madara.series('https://x.test/manga/page/2/');
assert.equal(hija.length, 1, 'la rejilla `a.acard` de los temas hijos');
assert.deepEqual(hija[0], {
  titulo: 'Obra Hija',
  url: 'https://x.test/manga/obra-hija/',
  portadaUrl: 'https://x.test/hija.webp',
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

// ── wetriedtls: sintetiza el índice del total en SSR ─────────────────────────
paginas['https://wt.test/robots.txt'] = 'User-agent: *';
paginas['https://wt.test/series/una-novela'] = `<html><head>
    <meta property="og:title" content="Una Novela - We Tried TLS">
    <meta property="og:image" content="https://wt.test/tapa.png"></head>
    <body><span>Total chapters</span><span class="x">43</span></body></html>`;

const wtSeries = await PLATAFORMAS.wetriedtls.series('https://wt.test/series/una-novela');
assert.equal(wtSeries.length, 1);
assert.equal(wtSeries[0].titulo, 'Una Novela', 'el "- We Tried TLS" se recorta del título');
assert.equal(wtSeries[0].portadaUrl, 'https://wt.test/tapa.png');

const wtCaps = await PLATAFORMAS.wetriedtls.capitulos('https://wt.test/series/una-novela');
assert.equal(wtCaps.length, 43, 'un capítulo por número, del total');
assert.equal(wtCaps[0].numero, 43, 'ordenados de mayor a menor');
assert.equal(wtCaps[0].url, 'https://wt.test/series/una-novela/chapter-43');
assert.equal(wtCaps[42].numero, 1, 'empieza en 1');

// ── olympus: catálogo por API + fuente link-out ─────────────────────────────
json['https://olympusxyz.com/robots.txt'] = 'User-agent: *';
json['https://olympusxyz.com/api/series?page=1'] = {
  data: {
    series: {
      last_page: 1,
      data: [
        { id: 5, name: 'Rayito', slug: 'rayito-20260825-110510525', cover: 'https://o.test/c.webp', type: 'comic', chapter_count: 417 },
        { id: 6, name: 'Una Novela', slug: 'una-novela-x', cover: '', type: 'novel', chapter_count: 88 },
      ],
    },
  },
};
// Filtra por tipo del sitio: un sitio 'manhwa' solo ve los type=comic.
const olySeries = await PLATAFORMAS.olympus.series('https://olympusxyz.com/api/series?page=1', { tipo: 'manhwa' });
assert.equal(olySeries.length, 1, 'solo el comic, no la novela');
assert.equal(olySeries[0].titulo, 'Rayito');
assert.equal(
  olySeries[0].url,
  'https://olympusxyz.com/series/comic-rayito-20260825-110510525#caps=417',
  'URL pública = comic- + slug, con el total en el fragmento',
);

const olyCaps = await PLATAFORMAS.olympus.capitulos(olySeries[0].url);
assert.equal(olyCaps.length, 1, 'link-out: una sola entrada a la serie');
assert.equal(olyCaps[0].numero, 417, 'lee el total del fragmento');
assert.equal(olyCaps[0].url, 'https://olympusxyz.com/series/comic-rayito-20260825-110510525', 'enlace sin el #caps');

const olyNov = await PLATAFORMAS.olympus.series('https://olympusxyz.com/api/series?page=1', { tipo: 'novela' });
assert.equal(olyNov.length, 1, 'como novela, solo el type=novel');
assert.equal(olyNov[0].titulo, 'Una Novela');

// ── manhwaweb: link-out desde el backend, filtrando por tipo ─────────────────
json['https://manhwawebbackend-production.up.railway.app/manhwa/library?page=1'] = {
  next: true,
  data: [
    { real_id: 'rey_123', name_esp: 'El Rey', the_real_name: 'The King', _imagen: 'https://mw.test/k.jpg', _tipo: 'manhwa', _numero_cap: '212.5' },
    { real_id: 'nov_9', name_esp: 'Una Novela MW', _tipo: 'novela', _numero_cap: 40 },
  ],
};
const mwSeries = await PLATAFORMAS.manhwaweb.series(
  'https://manhwawebbackend-production.up.railway.app/manhwa/library?page=1',
  { tipo: 'manhwa' },
);
assert.equal(mwSeries.length, 1, 'como manhwa, excluye la novela');
assert.equal(mwSeries[0].titulo, 'El Rey', 'prefiere name_esp');
assert.equal(mwSeries[0].url, 'https://manhwaweb.com/manhwa/rey_123#caps=212', 'trunca el 212.5 y enlaza a la serie');
const mwCaps = await PLATAFORMAS.manhwaweb.capitulos(mwSeries[0].url);
assert.equal(mwCaps[0].numero, 212);
assert.equal(mwCaps[0].url, 'https://manhwaweb.com/manhwa/rey_123', 'enlace limpio');

// ── blogger: series desde las PÁGINAS (/p/…), capítulos desde sus enlaces ───
const BLOG = 'https://b.test';
json[`${BLOG}/robots.txt`] = 'User-agent: *';
paginas[`${BLOG}/robots.txt`] = 'User-agent: *';
json[`${BLOG}/feeds/pages/default?alt=json&max-results=150&start-index=1`] = {
  feed: {
    entry: [
      { title: { $t: 'Monte Hua Novela' }, link: [{ rel: 'alternate', href: `${BLOG}/p/monte-hua.html` }] },
      { title: { $t: 'Solo Manhwa' }, link: [{ rel: 'alternate', href: `${BLOG}/p/solo.html` }] },
      { title: { $t: 'Ruido suelto' }, link: [{ rel: 'alternate', href: `${BLOG}/p/ruido.html` }] },
    ],
  },
};
json[`${BLOG}/feeds/pages/default?alt=json&max-results=150&start-index=4`] = { feed: { entry: [] } };
// El índice de capítulos vive en la página, y a menudo apunta a OTRO host.
paginas[`${BLOG}/p/monte-hua.html`] = `<div>
    <a href="https://otro.test/c2">Capítulo 2</a>
    <a href="https://otro.test/c1">Capítulo 1</a>
    <a href="https://ko-fi.com/x">Apóyanos</a>
  </div>`;

const blSeries = await PLATAFORMAS.blogger.series(`${BLOG}/feeds/pages/default`, { tipo: 'novela' });
assert.equal(blSeries.length, 1, 'solo las páginas marcadas Novela, no el ruido ni el manhwa');
assert.equal(blSeries[0].titulo, 'Monte Hua', 'quita el marcador "Novela" del final');
const blCaps = await PLATAFORMAS.blogger.capitulos(blSeries[0].url);
assert.equal(blCaps.length, 2, 'solo los enlaces de capítulo; el ko-fi fuera');
assert.equal(blCaps[0].numero, 2);
assert.equal(blCaps[0].url, 'https://otro.test/c2', 'enlaza al host que aloja el capítulo');

// ── asura: API JSON + enlaces SIN el hash (que caduca) ──────────────────────
json['https://api.asurascans.com/robots.txt'] = 'User-agent: *';
json['https://api.asurascans.com/api/series?page=1'] = {
  data: [
    {
      id: 7,
      slug: 'obra-asura',
      title: 'Obra Asura',
      alt_titles: ['La Obra Asura', 'Obra Asura'],
      cover: 'https://cdn.asurascans.com/tapa.webp',
      status: 'ongoing',
      // El hash de public_url es el mismo para todas las series (es de build):
      // por eso NO se usa, y el enlace va a /comics/<slug> a secas.
      public_url: '/comics/obra-asura-b57aa235',
      genres: [{ name: 'Action' }],
    },
    { id: 8, title: 'Sin slug' }, // se descarta: no se puede pedir su índice
  ],
};
json['https://api.asurascans.com/api/series/obra-asura/chapters'] = {
  data: [
    { number: 12, slug: 'chapter-12', published_at: '2026-08-29T12:28:39.325864Z' },
    { number: 11, slug: 'bf06afb5-6317-44e7-8ccf-987128faa03f', published_at: '2026-08-01T00:00:00Z' },
  ],
};

const asSeries = await PLATAFORMAS.asura.series('https://api.asurascans.com/api/series?page=1');
assert.equal(asSeries.length, 1, 'sin slug no hay serie');
assert.equal(asSeries[0].url, 'https://asurascans.com/comics/obra-asura', 'enlace sin el hash de build');
assert.deepEqual(asSeries[0].titulosAlt, ['La Obra Asura'], 'el alterno igual al título no se repite');
assert.equal(asSeries[0].estado, 'En emisión');
assert.deepEqual(asSeries[0].categorias, ['Action']);

const asCaps = await PLATAFORMAS.asura.capitulos(asSeries[0].url);
assert.equal(asCaps.length, 2);
assert.equal(asCaps[0].numero, 12);
assert.equal(
  asCaps[0].url,
  'https://asurascans.com/comics/obra-asura/chapter/12',
  'la URL del capítulo va por su número, no por su slug (que a veces es un UUID)',
);
assert.equal(asCaps[0].fecha_texto, '2026-08-29');

// ── wtr: enumera por el SITEMAP, saca el título del slug, link-out ──────────
paginas['https://wtr-lab.com/robots.txt'] = 'User-agent: *\nDisallow: /api';
paginas['https://wtr-lab.com/novels/index.xml'] = `<sitemapindex>
    <sitemap><loc>https://wtr-lab.com/novels/sitemap/0.xml</loc></sitemap>
    <sitemap><loc>https://wtr-lab.com/novels/sitemap/1.xml</loc></sitemap>
  </sitemapindex>`;
paginas['https://wtr-lab.com/novels/sitemap/0.xml'] = `<urlset>
    <url><loc>https://wtr-lab.com/en/novel/42/the-immortal-genius-spearman</loc></url>
    <url><loc>https://wtr-lab.com/en/novel/42/the-immortal-genius-spearman</loc></url>
  </urlset>`;
paginas['https://wtr-lab.com/novels/sitemap/1.xml'] = `<urlset>
    <url><loc>https://wtr-lab.com/en/novel/7/some-random-chinese-webnovel</loc></url>
  </urlset>`;
paginas['https://wtr-lab.com/en/novel/42/the-immortal-genius-spearman'] =
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { serie: { serie_data: { chapter_count: 812 } } } },
  })}</script></body></html>`;

const wtrSeries = await PLATAFORMAS.wtr.series('https://wtr-lab.com/novels/index.xml');
assert.equal(wtrSeries.length, 2, 'dos novelas únicas (el id repetido se colapsa)');
assert.equal(wtrSeries[0].titulo, 'the immortal genius spearman', 'el título sale del slug');
assert.equal(wtrSeries[0].url, 'https://wtr-lab.com/en/novel/42/the-immortal-genius-spearman');
const wtrCaps = await PLATAFORMAS.wtr.capitulos(wtrSeries[0].url);
assert.equal(wtrCaps.length, 1, 'link-out: una sola tarjeta');
assert.equal(wtrCaps[0].numero, 812, 'el conteo sale del __NEXT_DATA__');
assert.equal(esEnlace('wtr'), false, 'wtr sí hace petición (no es capitulosEnlace)');

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

// ── el ".5" se trunca al escribir, no revienta la columna int ────────────────
// (Regresión: leemiau daba data-num="272.5" y Postgres rechazaba el int.)
{
  const { scrapearFuente } = await import('./scrapear.mjs');
  paginas['https://x.test/manga/media/'] = `<div id="chapterlist"><ul>
      <li data-num="272.5"><a href="https://x.test/media-272-5/" data-chapter-title="Capítulo 272.5"></a></li>
      <li data-num="272"><a href="https://x.test/media-272/" data-chapter-title="Capítulo 272"></a></li>
    </ul></div>`;

  let escrito = null;
  const db = {
    from: () => ({
      upsert: async (filas) => ((escrito = filas), { error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
  await scrapearFuente(db, {
    id: 'f1',
    obra_slug: 'media',
    plataforma: 'mangareader',
    url_listado: 'https://x.test/manga/media/',
    idioma: 'es',
    tipo: 'manhwa',
  });
  assert.equal(escrito.length, 2);
  assert.equal(escrito[0].numero, 272, 'el 272.5 se guarda como 272');
  assert.equal(escrito[0].titulo, 'Capítulo 272.5', 'el título conserva el .5');
  assert.ok(
    Number.isInteger(escrito[0].numero) && Number.isInteger(escrito[1].numero),
    'ningún numero llega a la columna int como decimal',
  );
}

console.log('ok');
