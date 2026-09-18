-- ─────────────────────────────────────────────────────────────────────────────
-- EGRESS Y ESPACIO: snapshot incremental de capitulos_externos
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Por qué: cada build de Cloudflare bajaba la tabla ENTERA (637.549 filas,
-- ~60 MB comprimidos) y se construye 3 veces al día → ~5,4 GB/mes, todo el
-- egress del plan gratis. Ahora scripts/snapshot.mjs guarda la tabla en un
-- release de GitHub y cada noche pide a Supabase SOLO lo que cambió desde la
-- última vez: filas con `modificado_en` nuevo + ids en `capitulos_borrados`.

-- ── 1. Marca de cambio ───────────────────────────────────────────────────────
-- `default now()` es estable: Postgres ≥11 no reescribe la tabla al añadirla.
alter table public.capitulos_externos
  add column if not exists modificado_en timestamptz not null default now();
create index if not exists capitulos_externos_modificado_idx
  on public.capitulos_externos (modificado_en);

create or replace function public.tocar_modificado() returns trigger
language plpgsql as $$
begin
  new.modificado_en := now();
  return new;
end $$;

drop trigger if exists capitulos_externos_tocar on public.capitulos_externos;
create trigger capitulos_externos_tocar
  before update on public.capitulos_externos
  for each row execute function public.tocar_modificado();

-- ── 2. Lápidas: qué se borró, para quitarlo del snapshot ─────────────────────
-- snapshot.mjs purga las de más de 14 días (un snapshot más viejo que eso se
-- rehace entero), así que la tabla nunca crece.
create table if not exists public.capitulos_borrados (
  id uuid primary key,
  borrado_en timestamptz not null default now()
);
alter table public.capitulos_borrados enable row level security; -- solo service_role

create or replace function public.anotar_borrado() returns trigger
language plpgsql as $$
begin
  insert into public.capitulos_borrados (id) values (old.id) on conflict do nothing;
  return old;
end $$;

drop trigger if exists capitulos_externos_borrado on public.capitulos_externos;
create trigger capitulos_externos_borrado
  after delete on public.capitulos_externos
  for each row execute function public.anotar_borrado();

-- ── 3. Espacio: índice redundante ────────────────────────────────────────────
-- Todas las consultas a esta tabla filtran por (obra_slug, numero), y eso lo
-- cubre capitulos_externos_novela_idx. Este otro, con tipo e idioma en medio,
-- ya no lo usa nadie desde que el build lee la tabla entera por `id`.
drop index if exists public.capitulos_externos_obra_idx;

-- ── 4. Espacio: el único (fuente_id, url) guardaba cada URL entera ───────────
-- ~100 B por entrada × 637k filas ≈ 70 MB de índice. Con md5(url)::uuid son
-- 16 B fijos: ~30 MB. Colisión md5 entre URLs de UNA fuente: despreciable.
-- Se crea el nuevo ANTES de tirar el viejo: nunca hay un momento sin único.
create unique index if not exists capitulos_externos_fuente_urlhash_key
  on public.capitulos_externos (fuente_id, (md5(url)::uuid));

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.capitulos_externos'::regclass and contype = 'u'
    and conkey = array[
      (select attnum from pg_attribute where attrelid = 'public.capitulos_externos'::regclass and attname = 'fuente_id'),
      (select attnum from pg_attribute where attrelid = 'public.capitulos_externos'::regclass and attname = 'url')
    ]::int2[];
  if c is not null then
    execute format('alter table public.capitulos_externos drop constraint %I', c);
  end if;
end $$;

-- PostgREST solo apunta `on_conflict` a columnas, no a un índice por expresión:
-- scrapear.mjs inserta por aquí. `on conflict do nothing` sin objetivo atrapa el
-- único nuevo. Solo service_role (el scraper); ni anon ni usuarios.
create or replace function public.insertar_capitulos(filas jsonb) returns int
language sql as $$
  with ins as (
    insert into public.capitulos_externos
      (fuente_id, obra_slug, numero, titulo, url, fecha_texto, idioma, tipo, aprobado)
    select fuente_id, obra_slug, numero, titulo, url, fecha_texto, idioma, tipo, coalesce(aprobado, true)
    from jsonb_populate_recordset(null::public.capitulos_externos, filas)
    on conflict do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;
revoke execute on function public.insertar_capitulos(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ── 5. Diagnóstico (córrelo aparte, antes y después) ─────────────────────────
-- select relname,
--        pg_size_pretty(pg_total_relation_size(relid)) total,
--        pg_size_pretty(pg_indexes_size(relid))        indices,
--        n_dead_tup                                    filas_muertas
-- from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 8;
--
-- select indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) tam, idx_scan
-- from pg_stat_user_indexes order by pg_relation_size(indexrelid) desc limit 10;

-- ── 6. Devolver al disco lo borrado (córrelo SOLO, fuera de este script) ─────
-- Olympus reescribe su enlace 2 veces al día: filas muertas que ocupan sitio.
-- VACUUM FULL bloquea la tabla unos segundos; hazlo cuando no corra un workflow.
--   vacuum full analyze public.capitulos_externos;
--   vacuum full analyze public.fuentes;
