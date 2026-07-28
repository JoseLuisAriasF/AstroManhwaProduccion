-- Añadir una fuente nueva = un INSERT como este. No hace falta tocar código.
-- Selectores verificados contra el HTML real de maehwasup (tema de bloques WP).

insert into public.fuentes
  (nombre, url_listado, paginas, sel_item, sel_titulo, sel_enlace, sel_fecha, novela_slug)
values
  ('Maehwasup',
   'https://maehwasup.com/page/{page}/',
   250,  -- techo: el listado real termina antes de eso
   'li.wp-block-post',
   'h2.wp-block-post-title',
   'h2.wp-block-post-title a',
   '.wp-block-post-date',
   'return-of-the-mount-hua')
on conflict (url_listado, novela_slug) do nothing;
