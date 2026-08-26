/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DESCUBRIR: de "un sitio" a "todas sus obras"
 * ─────────────────────────────────────────────────────────────────────────────
 * Recorre el listado de series de cada sitio activo y por cada serie deja:
 *   · una fila en `obras`   → la obra en el catálogo (si aún no existía)
 *   · una fila en `fuentes` → de dónde sacar sus capítulos, en qué idioma
 *
 * Después `scrapear.mjs` recorre esas fuentes. Los dos scripts comparten los
 * adaptadores de plataformas.mjs, así que un sitio nuevo es un INSERT en
 * `sitios` y cero código.
 *
 *   node scripts/descubrir.mjs --probar=URL --plataforma=madara   # sin escribir
 *   node --env-file-if-exists=.env scripts/descubrir.mjs --seco   # qué haría
 *   node --env-file-if-exists=.env scripts/descubrir.mjs          # de verdad
 *
 * Necesita SUPABASE_SERVICE_KEY salvo en --probar.
 */
import { createClient } from '@supabase/supabase-js';
import { PLATAFORMAS, espera, slugify, utiles } from './plataformas.mjs';

// Solo se parte en el PRIMER '=': las URLs de listado traen query string
// (?m_orderby=latest) y partir en todos se comía medio parámetro.
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const limpio = a.replace(/^--/, '');
    const i = limpio.indexOf('=');
    return i === -1 ? [limpio, 'true'] : [limpio.slice(0, i), limpio.slice(i + 1)];
  }),
);

const CORTESIA = 1500; // ms entre páginas del mismo sitio

/** Sustituye {page} y, si no hay marcador, devuelve la URL tal cual. */
const pagina = (plantilla, p) => plantilla.replace('{page}', String(p));

/**
 * Recorre el listado hasta que se vacía, se repite o toca el techo `paginas`.
 * La repetición importa: muchos temas devuelven la página 1 cuando te pasas
 * del final en vez de un 404, y sin este corte el loop indexa lo mismo N veces.
 */
export async function seriesDe(sitio, { limite = Infinity } = {}) {
  const adaptador = PLATAFORMAS[sitio.plataforma];
  if (!adaptador) throw new Error(`plataforma desconocida: ${sitio.plataforma}`);

  const todas = [];
  const vistas = new Set();
  for (let p = 1; p <= sitio.paginas && todas.length < limite; p++) {
    const url = pagina(sitio.url_series, p);
    let items;
    try {
      items = utiles(await adaptador.series(url, sitio));
    } catch (e) {
      console.log(`    página ${p}: ${e.message} — se detiene`);
      break;
    }
    const nuevas = items.filter((i) => !vistas.has(i.url));
    nuevas.forEach((i) => vistas.add(i.url));
    todas.push(...nuevas);
    console.log(`    página ${p}: ${items.length} series (${nuevas.length} nuevas)`);
    if (nuevas.length === 0) break;
    if (!sitio.url_series.includes('{page}')) break; // listado sin paginación
    await espera(CORTESIA);
  }
  return todas.slice(0, limite);
}

/** Fila de `fuentes` para una serie: de aquí saldrán sus capítulos. */
const aFuente = (sitio, serie, slug) => ({
  nombre: sitio.nombre,
  url_listado: serie.url,
  paginas: 1, // la página de la serie ya trae su índice completo
  sel_item: sitio.sel_item ?? '',
  sel_titulo: sitio.sel_titulo ?? '',
  sel_enlace: sitio.sel_enlace ?? '',
  sel_fecha: sitio.sel_fecha,
  obra_slug: slug,
  idioma: sitio.idioma,
  tipo: sitio.tipo,
  plataforma: sitio.plataforma,
  sitio_id: sitio.id,
  portada_vista: serie.portadaUrl || null,
  activa: true,
});

async function descubrirSitio(db, sitio, seco) {
  const series = await seriesDe(sitio, { limite: Number(args.limite) || Infinity });
  if (!series.length) return 0;

  const obras = [];
  const fuentes = [];
  const slugs = new Set();
  for (const s of series) {
    const slug = slugify(s.titulo);
    if (!slug || slugs.has(slug)) continue; // dos entradas al mismo título
    slugs.add(slug);
    obras.push({
      slug,
      tipo: sitio.tipo,
      titulo: s.titulo,
      portada_url: s.portadaUrl || '',
      // sinopsis vacía a propósito: ver el comentario en schema-catalogo.sql.
    });
    fuentes.push(aFuente(sitio, s, slug));
  }

  if (seco) {
    console.log(`    [seco] ${obras.length} obras / ${fuentes.length} fuentes`);
    console.log(`    ej: ${obras[0]?.slug} ← ${fuentes[0]?.url_listado}`);
    return obras.length;
  }

  // ignoreDuplicates: lo que el admin ya editó (portada, sinopsis, título) no
  // se pisa en cada corrida. Una obra se descubre una vez y luego es suya.
  const r1 = await db.from('obras').upsert(obras, { onConflict: 'slug', ignoreDuplicates: true });
  if (r1.error) throw new Error(`obras: ${r1.error.message}`);
  const r2 = await db
    .from('fuentes')
    .upsert(fuentes, { onConflict: 'url_listado,obra_slug', ignoreDuplicates: true });
  if (r2.error) throw new Error(`fuentes: ${r2.error.message}`);

  await db.from('sitios').update({ ultimo_descubrimiento: new Date().toISOString() }).eq('id', sitio.id);
  return obras.length;
}

// ── Modo --probar: valida un sitio ANTES de meterlo en la BD ─────────────────
// `import.meta.main` en ambos bloques: sin él, importar `seriesDe` desde otro
// script arrancaría la corrida entera y moriría por falta de credenciales.
if (import.meta.main && args.probar) {
  const sitio = {
    nombre: 'prueba',
    plataforma: args.plataforma ?? 'madara',
    url_series: args.probar,
    paginas: Number(args.paginas) || 1,
    tipo: args.tipo ?? 'manhwa',
    idioma: args.idioma ?? 'es',
    sel_serie: args.sel_serie,
    sel_serie_titulo: args.sel_serie_titulo,
    sel_serie_enlace: args.sel_serie_enlace ?? 'a',
    sel_serie_portada: args.sel_serie_portada,
  };
  console.log(`→ ${sitio.url_series} (${sitio.plataforma})`);
  const series = await seriesDe(sitio, { limite: Number(args.limite) || 5 });
  for (const s of series) console.log(`  · ${slugify(s.titulo)}  ${s.portadaUrl ? '🖼' : '· '} ${s.url}`);
  if (series[0]) {
    const caps = utiles(await PLATAFORMAS[sitio.plataforma].capitulos(series[0].url, sitio));
    console.log(`\n  capítulos de "${series[0].titulo}": ${caps.length}`);
    for (const c of caps.slice(0, 3)) console.log(`    ${c.numero ?? '?'} · ${c.titulo} · ${c.url}`);
  }
  if (!series.length) console.log('  nada. Revisa la URL, la plataforma o los selectores.');
  process.exit(0);
}

// ── Corrida normal ───────────────────────────────────────────────────────────
if (import.meta.main) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Faltan PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: sitios, error } = await db.from('sitios').select('*').eq('activo', true);
  if (error) throw new Error(error.message);

  let total = 0;
  for (const sitio of sitios ?? []) {
    console.log(`→ ${sitio.nombre} · ${sitio.tipo} · ${sitio.idioma} · ${sitio.plataforma}`);
    try {
      total += await descubrirSitio(db, sitio, args.seco === 'true');
    } catch (e) {
      console.error(`  falló: ${e.message}`); // un sitio roto no tumba el resto
    }
  }
  console.log(`\n${total} obras vistas en ${sitios?.length ?? 0} sitios`);
}
