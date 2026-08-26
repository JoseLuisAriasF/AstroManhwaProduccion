-- Fuente a mano: un sitio del que solo interesa UNA obra, no su catálogo entero.
-- Para indexar un sitio completo usa `sitios` (ver seed-sitios.sql), que crea
-- estas filas solo. Selectores verificados contra el HTML real de maehwasup.
--
-- `idioma` y `tipo` son lo que hace que la ficha muestre pestañas separadas:
-- esta es la NOVELA en INGLÉS, que va cientos de capítulos por delante del
-- manhwa en español. Enseñar esa diferencia es el producto.

insert into public.fuentes
  (nombre, url_listado, paginas, plataforma, tipo, idioma,
   sel_item, sel_titulo, sel_enlace, sel_fecha, titulo_prefijo, obra_slug)
values
  ('Maehwasup',
   'https://maehwasup.com/page/{page}/',
   250,  -- techo: el listado real termina antes de eso
   'css', 'novela', 'en',
   'li.wp-block-post',
   'h2.wp-block-post-title',
   'h2.wp-block-post-title a',
   '.wp-block-post-date',
   'Chapter ',  -- descarta "Special Spinoff", "Side Story", etc.
   'return-of-the-mount-hua')
on conflict (url_listado, obra_slug) do nothing;
