-- Esquema mínimo para la capa gratuita de Supabase.
-- Solo guarda progreso de usuarios; el catálogo puede quedarse en el build estático.

create table if not exists public.progreso (
  user_id uuid not null references auth.users on delete cascade,
  novela_slug text not null,
  capitulos_leidos int[] not null default '{}',
  es_favorito boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (user_id, novela_slug)
);

alter table public.progreso enable row level security;

create policy "cada quien ve lo suyo" on public.progreso
  for select using (auth.uid() = user_id);

create policy "cada quien escribe lo suyo" on public.progreso
  for insert with check (auth.uid() = user_id);

create policy "cada quien actualiza lo suyo" on public.progreso
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cada quien borra lo suyo" on public.progreso
  for delete using (auth.uid() = user_id);

-- Opcional: catálogo en la nube cuando dejes de usar mock.ts.
-- create table public.novelas (
--   id uuid primary key default gen_random_uuid(),
--   slug text unique not null,
--   titulo text not null,
--   sinopsis text not null,
--   portada_url text not null,
--   estado text not null check (estado in ('En emisión','Finalizado')),
--   categorias text[] not null default '{}'
-- );
-- create table public.capitulos (
--   id uuid primary key default gen_random_uuid(),
--   novela_slug text references public.novelas(slug) on delete cascade,
--   numero int not null,
--   titulo text not null,
--   contenido_texto text not null,
--   fecha_publicacion timestamptz not null default now(),
--   equivalencia_manhwa int,
--   unique (novela_slug, numero)
-- );
-- create table public.equivalencias (
--   novela_slug text references public.novelas(slug) on delete cascade,
--   capitulo_manhwa int not null,
--   capitulo_novela int not null,
--   primary key (novela_slug, capitulo_manhwa)
-- );
