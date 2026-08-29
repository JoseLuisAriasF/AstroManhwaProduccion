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
  plataforma text not null default 'css' check (plataforma in ('madara','mangareader','css','mangadex','sheet','wetriedtls','olympus','blogger','manhwaweb','asura','wtr')),
  tipo text not null default 'manhwa' check (tipo in ('manhwa','novela')),
  idioma text not null default 'es',
  -- Listado de series con {page} como marcador de paginación.
  url_series text not null unique,
  paginas int not null default 5,   -- techo de seguridad; corta antes si se vacía
  -- Solo para plataforma 'css'. Los adaptadores traen los suyos.
  sel_serie text, sel_serie_titulo text, sel_serie_enlace text, sel_serie_portada text,
  sel_item text, sel_titulo text, sel_enlace text, sel_fecha text,
  activo boolean not null default true,
  -- solo_match: la fuente NO crea obras nuevas, solo se engancha a las que ya
  -- existen (WTR-Lab: 91.000 novelas, casi ninguna con manhwa). Ver descubrir.mjs.
  solo_match boolean not null default false,
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

-- ── 5. obras: enriquecimiento de metadata (scripts/enriquecer.mjs) ────────────
-- Sinopsis, títulos alternos, géneros y estado desde AniList/MangaUpdates/
-- MangaBaka/MAL. `enriquecida` marca las ya procesadas: se enriquece cada obra
-- UNA vez y en adelante solo las nuevas. `metadatos_fuente` = qué base casó.
alter table public.obras add column if not exists enriquecida boolean not null default false;
alter table public.obras add column if not exists metadatos_fuente text;
create index if not exists obras_enriquecida_idx on public.obras (enriquecida);

-- ── 6. Equivalencias manhwa↔novela aportadas por la comunidad ─────────────────
-- El admin pone las oficiales en `equivalencias` y esas MANDAN. Estas las aporta
-- cualquiera con sesión de Google: un usuario, un voto por (obra, cap. manhwa);
-- el sitio muestra el consenso (el valor más votado). Así la precisión mejora
-- sola con el uso, sin que el admin tenga que anclar cada obra a mano.
create table if not exists public.equivalencias_sugeridas (
  id uuid primary key default gen_random_uuid(),
  obra_slug text not null,
  capitulo_manhwa int not null check (capitulo_manhwa >= 1),
  capitulo_novela int not null check (capitulo_novela >= 1),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  creada_en timestamptz not null default now(),
  unique (obra_slug, capitulo_manhwa, usuario_id)
);
alter table public.equivalencias_sugeridas enable row level security;
-- Lectura pública: el cliente necesita agregarlas para calcular el consenso.
drop policy if exists "lee sugerencias" on public.equivalencias_sugeridas;
create policy "lee sugerencias" on public.equivalencias_sugeridas for select using (true);
-- Solo un usuario autenticado inserta, y solo como sí mismo (no puede suplantar).
drop policy if exists "aporta autenticado" on public.equivalencias_sugeridas;
create policy "aporta autenticado" on public.equivalencias_sugeridas
  for insert to authenticated with check (usuario_id = auth.uid());
-- Puede corregir o borrar lo SUYO (cambiar su voto), nada más.
drop policy if exists "corrige lo suyo" on public.equivalencias_sugeridas;
create policy "corrige lo suyo" on public.equivalencias_sugeridas
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists "borra lo suyo" on public.equivalencias_sugeridas;
create policy "borra lo suyo" on public.equivalencias_sugeridas
  for delete to authenticated using (usuario_id = auth.uid());
create index if not exists eq_sugeridas_obra_idx on public.equivalencias_sugeridas (obra_slug);
create index if not exists eq_sugeridas_usuario_idx on public.equivalencias_sugeridas (usuario_id, creada_en);

-- Tope antiabuso: 10 aportes por usuario cada 24 h. El admin (su email en la
-- tabla `admins`) es ilimitado. Va en un TRIGGER, no en el cliente: la RLS deja
-- insertar y cualquiera podría llamar a la API directo, así que el límite tiene
-- que vivir en la base para que sea de verdad.
create or replace function public.limite_aportes() returns trigger as $$
declare
  n int;
  es_admin boolean;
begin
  select exists (
    select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')
  ) into es_admin;
  if es_admin then
    return new;
  end if;

  select count(*) into n
  from public.equivalencias_sugeridas
  where usuario_id = auth.uid()
    and creada_en > now() - interval '24 hours';
  if n >= 10 then
    raise exception 'Alcanzaste el límite de 10 aportes por día. Vuelve mañana.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists limite_aportes_trg on public.equivalencias_sugeridas;
create trigger limite_aportes_trg
  before insert on public.equivalencias_sugeridas
  for each row execute function public.limite_aportes();

-- ── 5. Admin ─────────────────────────────────────────────────────────────────
-- Quién puede editar. Las altas van en seed-sitios.sql, o a mano:
--   insert into public.admins values ('joseluisariasflores01@gmail.com');
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;
drop policy if exists "un admin se ve a si mismo" on public.admins;
create policy "un admin se ve a si mismo" on public.admins
  for select using (auth.jwt() ->> 'email' = email);

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = auth.jwt() ->> 'email');
$$;

alter table public.obras enable row level security;
alter table public.sitios enable row level security;

-- El sitio (anon) lee lo publicado; el admin lo lee y lo escribe todo.
drop policy if exists "lectura publica de obras" on public.obras;
create policy "lectura publica de obras" on public.obras
  for select using (publicada = true or public.es_admin());
drop policy if exists "admin escribe obras" on public.obras;
create policy "admin escribe obras" on public.obras
  for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "admin gestiona sitios" on public.sitios;
create policy "admin gestiona sitios" on public.sitios
  for all using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin gestiona fuentes" on public.fuentes;
create policy "admin gestiona fuentes" on public.fuentes
  for all using (public.es_admin()) with check (public.es_admin());
-- El admin necesita ver también lo NO aprobado para poder aprobarlo.
drop policy if exists "admin gestiona capitulos" on public.capitulos_externos;
create policy "admin gestiona capitulos" on public.capitulos_externos
  for all using (public.es_admin()) with check (public.es_admin());

-- ── Migración de plataformas ─────────────────────────────────────────────────
-- El CHECK de `plataforma` vive inline en el CREATE, que `if not exists` no
-- vuelve a aplicar. Este ALTER sí actualiza una tabla ya creada, para añadir
-- plataformas nuevas ('mangadex', 'sheet', 'asura'…) sin recrear nada. Idempotente.
do $$
begin
  alter table public.sitios drop constraint if exists sitios_plataforma_check;
  alter table public.sitios add constraint sitios_plataforma_check
    check (plataforma in ('madara','mangareader','css','mangadex','sheet','wetriedtls','olympus','blogger','manhwaweb','asura','wtr'));
end $$;

-- solo_match en una tabla ya creada (el CREATE con `if not exists` no la añade).
alter table public.sitios add column if not exists solo_match boolean not null default false;

-- ── Anclas manhwa ↔ novela ───────────────────────────────────────────────────
-- Vive originalmente en schema-fuentes.sql, pero se recrea aquí para que correr
-- SOLO este archivo deje el catálogo completo y no falte la tabla del puente.
-- El sitio cae al mock si no existe, así que esto solo silencia el aviso y deja
-- el puente listo por si algún día se cargan anclas a mano.
create table if not exists public.equivalencias (
  novela_slug text not null,
  capitulo_manhwa int not null,
  capitulo_novela int not null,
  primary key (novela_slug, capitulo_manhwa)
);

alter table public.equivalencias enable row level security;

drop policy if exists "lectura publica" on public.equivalencias;
create policy "lectura publica" on public.equivalencias
  for select using (true);

-- Que PostgREST la vea al instante, sin esperar el refresco automático.
notify pgrst, 'reload schema';

-- ── Nombre de la fuente visible al sitio ─────────────────────────────────────
-- La ficha agrupa los capítulos POR SCAN (estilo zonascans: "Samurai Scan ·
-- 240 caps"), y para eso necesita el nombre de la fuente. Es solo una etiqueta
-- pública (el nombre del scan), así que se deja leer a cualquiera. Los INSERT/
-- UPDATE siguen siendo solo del admin por la otra policy.
drop policy if exists "lectura publica de fuentes" on public.fuentes;
create policy "lectura publica de fuentes" on public.fuentes
  for select using (true);
