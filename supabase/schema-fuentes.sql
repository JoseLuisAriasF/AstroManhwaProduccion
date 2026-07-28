-- Índice de capítulos de sitios externos: metadata + enlace a la fuente.
-- No guarda el texto de los capítulos; el lector va a la fuente original.
-- Ejecutar en Supabase → SQL Editor, después de schema.sql.

create table if not exists public.fuentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- URL de listado con {page} como marcador de la paginación.
  -- Ej: https://maehwasup.com/page/{page}/
  url_listado text not null,
  paginas int not null default 2,
  -- Selectores CSS del listado. Cambian por sitio, por eso viven en la BD:
  -- añadir una fuente nueva es un INSERT, no un deploy.
  sel_item text not null,          -- contenedor de cada capítulo
  sel_titulo text not null,        -- texto del título dentro del item
  sel_enlace text not null,        -- <a> con el href al capítulo
  sel_fecha text,                  -- opcional
  novela_slug text not null,       -- a qué novela del catálogo pertenece
  activa boolean not null default true,
  ultimo_scrape timestamptz,
  -- Sin esto, correr el seed dos veces duplica la fuente y cada capítulo entra
  -- una vez por fuente: el unique de abajo es por fuente_id y no lo atrapa.
  unique (url_listado, novela_slug)
);

create table if not exists public.capitulos_externos (
  id uuid primary key default gen_random_uuid(),
  fuente_id uuid not null references public.fuentes on delete cascade,
  novela_slug text not null,
  numero int,                      -- extraído del título; null si no se pudo
  titulo text not null,
  url text not null,               -- enlace a la fuente original
  fecha_texto text,
  visto_en timestamptz not null default now(),
  aprobado boolean not null default false,  -- el admin decide qué se publica
  unique (fuente_id, url)
);

create index if not exists capitulos_externos_novela_idx
  on public.capitulos_externos (novela_slug, numero desc);

alter table public.fuentes enable row level security;
alter table public.capitulos_externos enable row level security;

-- El sitio (anon) solo lee lo aprobado. El scraper escribe con service_role,
-- que salta RLS por diseño: esa clave vive únicamente en GitHub Secrets.
create policy "lectura publica de aprobados" on public.capitulos_externos
  for select using (aprobado = true);
