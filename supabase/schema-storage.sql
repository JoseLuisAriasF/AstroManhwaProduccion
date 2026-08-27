-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE: bucket de portadas para subir imágenes desde /admin
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase → SQL Editor. Idempotente. Solo hace falta para poder
-- SUBIR una portada desde el panel; pegar una URL externa no necesita esto.
--
-- Las portadas son públicas (el sitio las muestra a cualquiera). Subir/borrar
-- queda restringido a los admins por la misma función es_admin() del catálogo.

-- Bucket público llamado 'portadas'.
insert into storage.buckets (id, name, public)
values ('portadas', 'portadas', true)
on conflict (id) do update set public = true;

-- Lectura pública (el bucket ya es public, esto lo hace explícito).
drop policy if exists "portadas lectura publica" on storage.objects;
create policy "portadas lectura publica" on storage.objects
  for select using (bucket_id = 'portadas');

-- Subir / reemplazar / borrar: solo admins.
drop policy if exists "portadas escribe admin" on storage.objects;
create policy "portadas escribe admin" on storage.objects
  for insert with check (bucket_id = 'portadas' and public.es_admin());

drop policy if exists "portadas actualiza admin" on storage.objects;
create policy "portadas actualiza admin" on storage.objects
  for update using (bucket_id = 'portadas' and public.es_admin());

drop policy if exists "portadas borra admin" on storage.objects;
create policy "portadas borra admin" on storage.objects
  for delete using (bucket_id = 'portadas' and public.es_admin());
