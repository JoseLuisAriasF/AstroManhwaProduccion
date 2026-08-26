-- ─────────────────────────────────────────────────────────────────────────────
-- CATÁLOGO EN LA NUBE + DESCUBRIMIENTO AUTOMÁTICO + ADMIN
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase → SQL Editor, DESPUÉS de schema.sql y schema-fuentes.sql.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué cambia respecto de schema-fuentes.sql:
--   1. `obras` — el catálogo deja de vivir en mockData.ts y pasa a ser editable.
--   2. `sitios` — un INSERT indexa un sitio ENTERO (todas sus series), no una.
--   3. `fuentes` gana idioma + tipo: la misma obra puede tener el manhwa en
--      inglés y la novela en español, cada una con su conteo de capítulos.
--   4. `admins` + políticas de escritura para el panel /admin.
--
-- Invariante que no se toca: NUNCA se guarda el texto ni las imágenes de un
-- capítulo. Solo título, número, fecha y el enlace al sitio de origen.

-- ── 1. Renombrar novela_slug → obra_slug ─────────────────────────────────────
-- Una "obra" es la historia; el manhwa y la novela son dos fuentes de la misma.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'fuentes' and column_name = 'novela_slug') then
    alter table public.fuentes rename column novela_slug to obra_slug;
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'capitulos_externos' and column_name = 'novela_slug') then
    alter table public.capitulos_externos rename column novela_slug to obra_slug;
  end if;
end $$;

-- ── 2. Catálogo ──────────────────────────────────────────────────────────────
create table if not exists public.obras (
  slug text primary key,
  tipo text not null default 'manhwa' check (tipo in ('manhwa','novela','ambos')),
  titulo text not null,
  -- Cómo se busca la obra en otros idiomas. Es lo que trae tráfico de fuera:
  -- el lector portugués busca el título en portugués, no el español.
  titulos_alternativos text[] not null default '{}',
  -- Se deja VACÍA a propósito al descubrir. Una sinopsis scrapeada es texto
  -- de otro sitio sin traducir: contenido duplicado en los 7 idiomas.
  -- La escribe el admin, y entonces sí entra al pipeline de traducción.
  sinopsis text not null default '',
  portada_url text not null default '',
  estado text not null default 'En emisión' check (estado in ('En emisión','Finalizado')),
  categorias text[] not null default '{}',
  destacada boolean not null default false,
  -- Falso hasta que el admin la revisa. Controla si sale en el sitio.
  publicada boolean not null default true,
  creada_en timestamptz not null default now()
);

-- ── 3. Sitios: un INSERT = un sitio entero ───────────────────────────────────
-- `plataforma` elige el adaptador de scripts/plataformas.mjs. 'madara' y
-- 'mangareader' son los dos temas de WordPress que usa la mayoría de las scans:
-- para esos NO hacen falta selectores, solo la URL del listado.
create table if not exists public.sitios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  plataforma text not null default 'css' check (plataforma in ('madara','mangareader','css')),
  tipo text not null default 'manhwa' check (tipo in ('manhwa','novela')),
  idioma text not null default 'es',
  -- Listado de series con {page} como marcador de paginación.
  url_series text not null unique,
  paginas int not null default 5,   -- techo de seguridad; corta antes si se vacía
  -- Solo para plataforma 'css'. Los adaptadores traen los suyos.
  sel_serie text, sel_serie_titulo text, sel_serie_enlace text, sel_serie_portada text,
  sel_item text, sel_titulo text, sel_enlace text, sel_fecha text,
  activo boolean not null default true,
  ultimo_descubrimiento timestamptz
);

-- ── 4. fuentes: idioma, tipo y plataforma ────────────────────────────────────
alter table public.fuentes add column if not exists idioma text not null default 'es';
alter table public.fuentes add column if not exists tipo text not null default 'novela';
alter table public.fuentes add column if not exists plataforma text not null default 'css';
alter table public.fuentes add column if not exists sitio_id uuid references public.sitios on delete cascade;
-- Portada que vio el descubridor. El admin la puede pisar en `obras`.
alter table public.fuentes add column if not exists portada_vista text;

alter table public.capitulos_externos add column if not exists idioma text not null default 'es';
alter table public.capitulos_externos add column if not exists tipo text not null default 'novela';

create index if not exists capitulos_externos_obra_idx
  on public.capitulos_externos (obra_slug, tipo, idioma, numero desc);
create index if not exists fuentes_obra_idx on public.fuentes (obra_slug);

-- ── 5. Admin ─────────────────────────────────────────────────────────────────
-- Quién puede editar. Las altas van en seed-sitios.sql, o a mano:
--   insert into public.admins values ('joseluisariasflores01@gmail.com');
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;
create policy "un admin se ve a si mismo" on public.admins
  for select using (auth.jwt() ->> 'email' = email);

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = auth.jwt() ->> 'email');
$$;

alter table public.obras enable row level security;
alter table public.sitios enable row level security;

-- El sitio (anon) lee lo publicado; el admin lo lee y lo escribe todo.
create policy "lectura publica de obras" on public.obras
  for select using (publicada = true or public.es_admin());
create policy "admin escribe obras" on public.obras
  for all using (public.es_admin()) with check (public.es_admin());

create policy "admin gestiona sitios" on public.sitios
  for all using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona fuentes" on public.fuentes
  for all using (public.es_admin()) with check (public.es_admin());
-- El admin necesita ver también lo NO aprobado para poder aprobarlo.
create policy "admin gestiona capitulos" on public.capitulos_externos
  for all using (public.es_admin()) with check (public.es_admin());
