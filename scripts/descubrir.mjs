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
 *   npm run descubrir -- --sitio=mgeko --traducir   # empareja en/pt con el traductor local
 *
 * Necesita SUPABASE_SERVICE_KEY salvo en --probar.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { PLATAFORMAS, espera, slugify, utiles } from './plataformas.mjs';
import { IndiceObras } from './emparejar.mjs';
import { esRetirada } from '../src/lib/dmca.ts';

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

/** Trae una tabla entera saltando el corte de 1000 filas por request. */
async function todasLasFilas(db, tabla, columnas) {
  const TAM = 1000;
  const todas = [];
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await db.from(tabla).select(columnas).range(desde, desde + TAM - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    todas.push(...data);
    if (data.length < TAM) break;
  }
  return todas;
}

/** Sustituye {page} y, si no hay marcador, devuelve la URL tal cual. */
const pagina = (plantilla, p) => plantilla.replace('{page}', String(p));

/**
 * Recorre el listado hasta que se vacía, se repite o toca el techo `paginas`.
 * La repetición importa: muchos temas devuelven la página 1 cuando te pasas
 * del final en vez de un 404, y sin este corte el loop indexa lo mismo N veces.
 */
export async function seriesDe(sitio, { limite = Infinity, topePaginas = Infinity } = {}) {
  const adaptador = PLATAFORMAS[sitio.plataforma];
  if (!adaptador) throw new Error(`plataforma desconocida: ${sitio.plataforma}`);

  const todas = [];
  const vistas = new Set();
  // El daily recorre solo las primeras páginas (--paginas=N): los catálogos van
  // ordenados por "más reciente", así que un título nuevo cae ahí. El barrido
  // completo (sin tope) se reserva al domingo.
  const tope = Math.min(sitio.paginas, topePaginas);
  for (let p = 1; p <= tope && todas.length < limite; p++) {
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
  // `activa` NO se pone: la togglea el admin. En INSERT cae al default (true);
  // en UPDATE, omitirla la preserva.
});

/** Todos los nombres por los que se conoce una serie, para emparejar. */
const nombresDe = (s) => [s.titulo, s.slugBase, ...(s.titulosAlt ?? [])].filter(Boolean);

/**
 * --traducir: fuentes en otro idioma contra un catálogo que en buena parte solo
 * conoce el título en español. "The Greatest Estate Developer" no comparte ni
 * una clave con una ficha que solo sabe "El mayor desarrollador de bienes
 * raíces". Las series que no emparejaron se pasan por el traductor local
 * (traductor/, API de LibreTranslate) y se vuelven a buscar en español.
 *
 * Solo sirve para BUSCAR: la traducción nunca se guarda como título de la obra,
 * que un título de máquina no es un alternativo de verdad. Caché por título: la
 * segunda corrida no traduce nada.
 */
const CACHE_ES = 'scripts/.titulos-es-cache.json';

async function traducirAlEspanol(series, idioma) {
  const LT = process.env.LIBRETRANSLATE_URL;
  if (!LT) return console.log('    --traducir sin LIBRETRANSLATE_URL: se empareja sin traductor');
  const cache = existsSync(CACHE_ES) ? JSON.parse(readFileSync(CACHE_ES, 'utf8')) : {};
  const clave = (t) => `${idioma}:${t}`;
  const faltan = [...new Set(series.map((s) => s.titulo))].filter((t) => !(clave(t) in cache));
  console.log(`    traduciendo ${faltan.length} títulos sin emparejar (${series.length} sin match)`);
  for (let i = 0; i < faltan.length; i += 16) {
    const lote = faltan.slice(i, i + 16);
    try {
      const res = await fetch(`${LT}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: lote, source: idioma, target: 'es', format: 'text' }),
        signal: AbortSignal.timeout(600000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { translatedText } = await res.json();
      lote.forEach((t, j) => (cache[clave(t)] = translatedText[j]));
    } catch (e) {
      console.log(`    traductor: ${e.message} — el resto se empareja sin traducir`);
      break;
    }
    writeFileSync(CACHE_ES, JSON.stringify(cache));
    console.log(`    ${Math.min(i + 16, faltan.length)}/${faltan.length}`);
  }
  for (const s of series) s.tituloEs = cache[clave(s.titulo)];
}

export async function descubrirSitio(db, sitio, indice, seco) {
  const series = await seriesDe(sitio, {
    limite: Number(args.limite) || Infinity,
    topePaginas: Number(args.paginas) || Infinity,
  });
  if (!series.length) return 0;

  // Una serie que ya tiene fuente se queda con su obra, por URL. Sin esto, lo que
  // emparejó por traducción en local volvería a salir SIN match en el workflow
  // nocturno (allí no hay traductor) y crearía una ficha duplicada.
  const { data: previas } = await db.from('fuentes').select('id, obra_slug, url_listado').eq('sitio_id', sitio.id);
  const slugPorUrl = new Map((previas ?? []).map((f) => [f.url_listado, f.obra_slug]));

  // Adaptadores cuyo listado se queda corto (títulos recortados, sin
  // alternativos) completan la serie desde su página. Solo las que no tienen
  // fuente todavía y no casan ya: tras el primer alta, el nocturno casi no pide nada.
  const adaptador = PLATAFORMAS[sitio.plataforma];
  if (adaptador.detalles) {
    const faltan = series.filter(
      (s) => !slugPorUrl.has(s.url) && (s.titulo.endsWith('…') || !indice.buscar(nombresDe(s))),
    );
    console.log(`    detalles de ${faltan.length} series`);
    for (const [i, s] of faltan.entries()) {
      try {
        const d = await adaptador.detalles(s.url);
        if (d.titulo) s.titulo = s.slugBase = d.titulo;
        s.titulosAlt = [...new Set([...(s.titulosAlt ?? []), ...(d.titulosAlt ?? [])])];
      } catch (e) {
        console.log(`    ${s.url}: ${e.message}`);
      }
      if (i % 100 === 99) console.log(`    ${i + 1}/${faltan.length}`);
      await espera(1000);
    }
  }

  if (args.traducir && sitio.idioma !== 'es') {
    await traducirAlEspanol(
      series.filter((s) => !slugPorUrl.has(s.url) && !indice.buscar(nombresDe(s))),
      sitio.idioma,
    );
  }

  const obras = [];
  const fuentes = [];
  const slugs = new Set();
  let emparejadas = 0;
  for (const s of series) {
    // ¿Ya existe esta obra bajo otro nombre o de otra fuente? Si una scan la
    // tiene como "Regreso de la Secta del Monte Hua" y MangaDex como "Return
    // of the Mount Hua Sect", ambas caen en el mismo slug y sus capítulos —
    // manhwa y novela, es y en— se juntan en una sola ficha.
    let existente = slugPorUrl.get(s.url) ?? indice.buscar(nombresDe(s));
    if (!existente && s.tituloEs && (existente = indice.buscar([s.tituloEs]))) {
      console.log(`    ≈ "${s.titulo}" → "${s.tituloEs}" → ${existente}`);
    }
    // Por parecido, solo con --traducir: es la corrida en local que alguien
    // revisa. El nocturno se queda con la igualdad exacta, que no se equivoca.
    // Dos umbrales: la traducción de máquina mete ruido (artículos, plurales,
    // sinónimos) y se le pasa 0,8; entre nombres originales una palabra de
    // diferencia suele ser otra obra ("…the Villainess" ≠ "…the Resurrected
    // Villainess"), así que ahí se pide 0,9.
    if (!existente && args.traducir) {
      const p = (s.tituloEs && indice.parecido([s.tituloEs], 0.8)) || indice.parecido(nombresDe(s), 0.9);
      if (p) {
        existente = p.slug;
        console.log(`    ~${p.parecido.toFixed(2)} "${s.titulo}"${s.tituloEs ? ` → "${s.tituloEs}"` : ''} → ${p.slug}`);
      }
    }
    // solo_match: fuentes que NO crean obras, solo se enganchan a las que ya
    // existen. WTR-Lab son 91.000 web-novels chinas; casi ninguna tiene manhwa.
    // Meterlas todas serían 91.000 fichas de relleno. Con esto, solo se queda la
    // que casa con un manhwa del catálogo —el puente novela↔manhwa, que es el
    // único motivo de añadir la fuente—.
    if (sitio.solo_match && !existente) continue;
    // `slugBase` es la identidad de la obra, igual en todos los idiomas; el
    // título visible sí es el localizado. Las scans no lo traen y caen al título.
    const slug = existente ?? slugify(s.slugBase ?? s.titulo);
    if (!slug || slugs.has(slug) || esRetirada(slug)) continue; // dos entradas al mismo título en este sitio o DMCA
    slugs.add(slug);

    if (existente) {
      emparejadas++; // la obra ya existe: solo se añade la fuente, no se recrea
    } else {
      obras.push({
        slug,
        tipo: sitio.tipo,
        titulo: s.titulo,
        portada_url: s.portadaUrl || '',
        // Las scans no dan más que título y portada. MangaDex sí trae títulos en
        // otros idiomas, estado y géneros, y esos campos entran ya rellenos.
        // Los títulos alternativos son los que traen tráfico de otros idiomas.
        ...(s.titulosAlt?.length ? { titulos_alternativos: s.titulosAlt } : {}),
        ...(s.estado ? { estado: s.estado } : {}),
        ...(s.categorias?.length ? { categorias: s.categorias } : {}),
        // sinopsis vacía a propósito: ver el comentario en schema-catalogo.sql.
      });
    }
    // Registrar sus nombres para que las siguientes series (de este sitio o del
    // siguiente en la misma corrida) también emparejen con ella.
    indice.registrar(slug, nombresDe(s));
    fuentes.push(aFuente(sitio, s, slug));
  }
  if (emparejadas) console.log(`    ${emparejadas} emparejadas con obras existentes`);

  if (seco) {
    console.log(`    [seco] ${obras.length} obras / ${fuentes.length} fuentes`);
    console.log(`    ej: ${obras[0]?.slug} ← ${fuentes[0]?.url_listado}`);
    return obras.length;
  }

  // ignoreDuplicates: lo que el admin ya editó (portada, sinopsis, título) no
  // se pisa en cada corrida. Una obra se descubre una vez y luego es suya.
  // defaultToNull: false — en un lote, PostgREST manda la UNIÓN de columnas y
  // rellena con NULL las que una fila no trae. mgeko mezcla obras con y sin
  // alternativos, y el NULL violaba el NOT NULL de titulos_alternativos. Así
  // la columna que falta toma su default ('{}').
  const r1 = await db
    .from('obras')
    .upsert(obras, { onConflict: 'slug', ignoreDuplicates: true, defaultToNull: false });
  if (r1.error) throw new Error(`obras: ${r1.error.message}`);
  // La identidad de una fuente es (sitio_id, obra_slug) —"la fuente de ESTE sitio
  // para ESTA obra"—, no su URL. Las fuentes link-out (olympus, manhwaweb) meten
  // un timestamp o un contador #caps en la URL que cambia cada corrida; con la
  // URL como clave, cada cambio creaba una fila nueva (Olympus además dejaba el
  // enlace viejo muerto). Se reusa el id de la fila existente para REFRESCAR su
  // URL en vez de duplicarla; `activa` no viaja en el objeto, así que se preserva.
  const idPorObra = new Map((previas ?? []).map((f) => [f.obra_slug, f.id]));
  for (const f of fuentes) {
    const id = idPorObra.get(f.obra_slug);
    if (id) f.id = id; // upsert por PK: actualiza esta fila, no inserta otra
  }
  // Las existentes se actualizan por PK; las nuevas se insertan (id por defecto).
  // En un MISMO upsert, mezclar filas con y sin `id` hacía que PostgREST mandara
  // id=NULL en las nuevas y violara el NOT NULL. Por eso van en dos operaciones.
  const conId = fuentes.filter((f) => f.id);
  const sinId = fuentes.filter((f) => !f.id);
  if (conId.length) {
    const r = await db.from('fuentes').upsert(conId);
    if (r.error) throw new Error(`fuentes (refrescar): ${r.error.message}`);
  }
  if (sinId.length) {
    const r = await db.from('fuentes').insert(sinId);
    if (r.error) throw new Error(`fuentes (nuevas): ${r.error.message}`);
  }

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

  // El índice arranca con TODO el catálogo ya conocido, para que una fuente
  // nueva empareje con obras descubiertas en corridas anteriores.
  const indice = new IndiceObras();
  const previas = await todasLasFilas(db, 'obras', 'slug, titulo, titulos_alternativos');
  for (const o of previas) indice.registrar(o.slug, [o.titulo, ...(o.titulos_alternativos ?? [])]);
  console.log(`índice: ${previas.length} obras conocidas`);

  // --sitio=texto: recorre solo los sitios cuyo nombre/plataforma/id casan, para
  // dar de alta uno nuevo sin repasar los ~11 sitios enteros (que son horas).
  const filtro = args.sitio?.toLowerCase();
  const objetivo = (sitios ?? []).filter(
    (s) => !filtro || s.id === args.sitio || s.plataforma === filtro || s.nombre.toLowerCase().includes(filtro),
  );
  if (filtro) console.log(`--sitio=${args.sitio}: ${objetivo.length} de ${sitios?.length ?? 0} sitios`);

  let total = 0;
  for (const sitio of objetivo) {
    console.log(`→ ${sitio.nombre} · ${sitio.tipo} · ${sitio.idioma} · ${sitio.plataforma}`);
    try {
      total += await descubrirSitio(db, sitio, indice, args.seco === 'true');
    } catch (e) {
      console.error(`  falló: ${e.message}`); // un sitio roto no tumba el resto
    }
  }
  console.log(`\n${total} obras vistas en ${sitios?.length ?? 0} sitios`);
}
