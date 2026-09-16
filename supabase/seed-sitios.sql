-- Sitios de origen. Añadir uno es un INSERT como estos: cero código, cero deploy.
-- `descubrir.mjs` recorre su listado y crea una obra + una fuente por serie;
-- `scrapear.mjs` indexa después los capítulos de cada fuente.
--
-- ANTES de insertar uno nuevo, compruébalo sin escribir en la BD:
--   node scripts/descubrir.mjs --probar='https://sitio.com/manga/page/{page}/' --plataforma=madara
-- Si no lista series, prueba la otra plataforma o pasa a 'css' con selectores.
--
-- ⚠ Usa el dominio REAL, no el de marca. samuraiscan.com redirige a su host
--   actual pero se come la ruta: /son/page/2/ acaba en la portada y el
--   descubridor no encuentra nada. Ese es justo el fallo que --probar detecta.

insert into public.sitios (nombre, plataforma, tipo, idioma, url_series, paginas, activo)
values
  -- Verificados el 26-08-2026 con --probar.
  ('Samurai Scan', 'madara',      'manhwa', 'es',
   'https://samurai.j5z.xyz/son/page/{page}/?m_orderby=latest',  40, true),
  ('Leemiau',      'mangareader', 'manhwa', 'es',
   'https://leemiau.com/manga/?page={page}&order=update',        40, true),
  ('Legion Scans', 'mangareader', 'manhwa', 'es',
   'https://legionscans.com/wp/manga/?page={page}&order=update', 40, true),
  -- Verificado el 31-08-2026 con --probar. Corre un tema HIJO de Madara
  -- (madara-child-mk): la rejilla usa `a.acard` en vez de `.page-item-detail`,
  -- que es lo que el adaptador aprendio a leer. Los capitulos salen del mismo
  -- POST a ajax/chapters/ de siempre. 541 series segun su wp-sitemap, 12 por
  -- pagina: 46 paginas bastan, se dejan 48 de margen.
  ('Imperiomanhua', 'madara',     'manhwa', 'es',
   'https://imperiomanhua.com/manga/page/{page}/?m_orderby=latest', 48, true),

  -- MangaDex: API pública, una fila POR IDIOMA. Es de donde sale el catálogo
  -- de verdad y la comparación entre idiomas (Eleceed: 8 caps en es, 103 en
  -- en, 293 en pt). `originalLanguage[]=ko` deja solo manhwa coreano; quítalo
  -- para incluir manhua chino y manga japonés.
  -- 100 obras por página × 30 = hasta 3.000 obras por idioma.
  ('MangaDex es', 'mangadex', 'manhwa', 'es',
   'https://api.mangadex.org/manga?limit=100&offset={page}&availableTranslatedLanguage[]=es&originalLanguage[]=ko&order[followedCount]=desc&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive', 30, true),
  ('MangaDex en', 'mangadex', 'manhwa', 'en',
   'https://api.mangadex.org/manga?limit=100&offset={page}&availableTranslatedLanguage[]=en&originalLanguage[]=ko&order[followedCount]=desc&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive', 30, true),
  ('MangaDex pt', 'mangadex', 'manhwa', 'pt',
   'https://api.mangadex.org/manga?limit=100&offset={page}&availableTranslatedLanguage[]=pt-br&originalLanguage[]=ko&order[followedCount]=desc&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive', 30, true),

  -- Olympus: catálogo en español (cómics y novelas). No expone la lista de
  -- capítulos, así que —igual que zonascans— cada serie es una tarjeta que
  -- enlaza a Olympus para leer. `type` en la API filtra comic vs novel; el
  -- adaptador lo cruza con el `tipo` de estas filas.
  ('Olympus', 'olympus', 'manhwa', 'es',
   'https://olympusxyz.com/api/series?page={page}&order[followedCount]=desc', 60, true),
  ('Olympus (novelas)', 'olympus', 'novela', 'es',
   'https://olympusxyz.com/api/series?page={page}&order[followedCount]=desc', 60, true),

  -- manhwaweb: agregador con backend público. Link-out como Olympus. El
  -- catálogo (nombre, portada, tipo, total) sale de /manhwa/library; se enlaza
  -- a su página de serie. Una fila para manhwa, otra para novelas.
  ('ManhwaWeb', 'manhwaweb', 'manhwa', 'es',
   'https://manhwawebbackend-production.up.railway.app/manhwa/library?page={page}', 200, true),
  ('ManhwaWeb (novelas)', 'manhwaweb', 'novela', 'es',
   'https://manhwawebbackend-production.up.railway.app/manhwa/library?page={page}', 200, true),

  -- Asura Scans: manhwa en inglés. La web es React pero su API (api.asurascans
  -- .com) es JSON público, con índice de capítulos y metadata ya rellena. Se
  -- enlaza /comics/<slug> SIN el hash: el sitio redirige al hash de hoy, así el
  -- enlace no caduca. 20 series por página × 20 = las ~340 del catálogo.
  ('Asura Scans', 'asura', 'manhwa', 'en',
   'https://api.asurascans.com/api/series?page={page}', 20, true),

  -- MangaGeko (mgeko.cc): manhwa en inglés. /browse-comics/ es JS, pero pide
  -- /browse-comics/data/, un JSON con las tarjetas; índice de capítulos
  -- completo en /manga/<slug>/all-chapters/. SIN filtro `type`: su
  -- clasificación falla (El hijo menor del clan de los asesinos… figura como
  -- "manga") y type=manhwa dejaba fuera 5.000 de sus ~7.000 series. 24 por
  -- página × 300. El PRIMER descubrimiento va en local con el traductor:
  --   npm run descubrir -- --sitio=mgeko --traducir
  -- Lo que emparejó ahí queda atado por URL y el nocturno ya no lo duplica.
  ('MangaGeko', 'mgeko', 'manhwa', 'en',
   'https://www.mgeko.cc/browse-comics/data/?page={page}&sort=latest', 300, true),

  -- animeshoy12: blog de Blogger, un post por capítulo, etiqueta = serie. Son
  -- ~2.700 novelas en español con lista de capítulos completa (no link-out).
  ('Animeshoy', 'blogger', 'novela', 'es',
   'https://animeshoy12.blogspot.com/feeds/posts/default', 1, true),

  -- wetriedtls: novelas en inglés con capítulos muy adelantados. Su catálogo
  -- es client-side, así que NO se descubre entero: se añade UNA novela por fila
  -- (url_series = la página de la serie). El emparejado la une con la misma
  -- obra si ya existe en MangaDex u otra fuente. Añade las que te interesen.
  ('We Tried TLS · Alone Against the Tower', 'wetriedtls', 'novela', 'en',
   'https://wetriedtls.com/series/alone-against-the-tower', 1, true),

  -- toonflip: Google Sheet servida por Apps Script. 52 obras, títulos en
  -- tailandés, enlaces a lectores tailandeses. Añadido porque se pidió, pero
  -- desactivado (activo=false): su público no es el de este sitio en español.
  -- Sirve de plantilla para cualquier otro agregador con backend de hoja.
  ('toonflip', 'sheet', 'manhwa', 'th',
   'https://script.google.com/macros/s/AKfycbzN70fdzRb5_rp95CPgkcRBBAjMkrQFtbdD1tWcNNScsW6qFGhr5-LQ-klfT2hFxNR4IQ/exec',
   1, false)
on conflict (url_series) do nothing;

-- WTR-Lab: 91.000+ web-novels en inglés, indexadas por su SITEMAP (su robots
-- prohíbe /api y las listas paginadas, pero anuncia /novels/index.xml). Va con
-- solo_match=true: NO crea obras —casi ninguna tiene manhwa—, solo se engancha
-- a las que ya existen en el catálogo. Por eso su INSERT es aparte: lleva la
-- columna solo_match, que el INSERT de arriba no tiene. Su url_series es el
-- sitemap índice, no un listado con {page}.
insert into public.sitios (nombre, plataforma, tipo, idioma, url_series, paginas, activo, solo_match)
values
  ('WTR-Lab', 'wtr', 'novela', 'en', 'https://wtr-lab.com/novels/index.xml', 1, true, true)
on conflict (url_series) do nothing;

-- WEBTOON (LINE, oficial). Manhwa en inglés, link-out con conteo real. El
-- adaptador recorre los 17 géneros por dentro, así que url_series es solo la
-- clave (no lleva {page}) y paginas=1. solo_match=false: da de alta todas sus
-- series como obras, no solo las que ya casan con una novela.
insert into public.sitios (nombre, plataforma, tipo, idioma, url_series, paginas, activo, solo_match)
values
  ('WEBTOON', 'webtoon', 'manhwa', 'en', 'https://www.webtoons.com/en/genres', 1, true, false)
on conflict (url_series) do nothing;

-- Quién puede editar el catálogo desde /admin. Este correo es lo ÚNICO que
-- distingue a un admin de cualquier visitante: RLS compara contra el correo de
-- la sesión de Google, así que no basta con saberlo, hay que ser esa cuenta.
insert into public.admins values ('joseluisariasflores01@gmail.com')
on conflict (email) do nothing;

-- La obra que ya existía en mockData.ts. Sin esta fila desaparecería del sitio
-- en cuanto `obras` deje de estar vacía: el fallback a mock es todo o nada.
insert into public.obras (slug, tipo, titulo, titulos_alternativos, sinopsis, portada_url, estado, categorias, destacada)
values (
  'return-of-the-mount-hua', 'ambos', 'Regreso de la Secta del Monte Hua',
  array['Return of the Mount Hua Sect','Return of the Blossoming Blade','Hwasan Jaerim','화산귀환','RotMH'],
  'Chung Myung, el trece veces campeón de la secta Hwasan, muere derrotando al Rey Demonio. Cien años después despierta en el cuerpo de un discípulo débil, y Hwasan —antes cumbre del jianghu— hoy es una sombra. Está de vuelta, y no para verla caer.',
  '/portadas/sin-portada.svg', 'En emisión',
  array['Artes marciales','Regresión','Wuxia'], true
) on conflict (slug) do nothing;
