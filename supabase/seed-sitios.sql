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

  -- toonflip: Google Sheet servida por Apps Script. 52 obras, títulos en
  -- tailandés, enlaces a lectores tailandeses. Añadido porque se pidió, pero
  -- desactivado (activo=false): su público no es el de este sitio en español.
  -- Sirve de plantilla para cualquier otro agregador con backend de hoja.
  ('toonflip', 'sheet', 'manhwa', 'th',
   'https://script.google.com/macros/s/AKfycbzN70fdzRb5_rp95CPgkcRBBAjMkrQFtbdD1tWcNNScsW6qFGhr5-LQ-klfT2hFxNR4IQ/exec',
   1, false)
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
  '/portadas/espadachin.svg', 'En emisión',
  array['Artes marciales','Regresión','Wuxia'], true
) on conflict (slug) do nothing;
