import type { Capitulo, CapituloExterno, EquivalenciaManhwa, Novela } from '@/types/novela';
import { IDIOMA_BASE, type Idioma } from './i18n';
import { generosEn } from './generos';
import { esProhibida } from './indexacion';
import { tituloIngles } from './titulos';
import { capitulosDe, equivalencias, novelas } from './mockData';
import { supabase } from './supabaseClient';
import { traducir, traducirTexto } from './traducir';

/**
 * Única puerta de acceso a datos. Hoy lee de mockData.ts; mañana, de Supabase.
 * Todo es async a propósito para que el cambio no toque ni una página.
 *
 * El origen guarda UN solo idioma. La localización se resuelve aquí contra el
 * caché de traducciones (ver src/lib/traducir.ts), que se rellena en el build.
 * Si un texto aún no está traducido devuelve el original: nunca rompe.
 *
 * ⚠ Este módulo es solo de build (arrastra el caché completo). Desde scripts
 * de cliente importa `@/lib/equivalencia`, no `@/lib/api`.
 */

function localizarNovela(n: Novela, idioma: Idioma): Novela {
  // El título NUNCA se traduce por máquina: se busca por su nombre original o el
  // inglés oficial («Return of the Mount Hua Sect»), no por «Return to the Mount
  // Hua Sect». En /en/ se usa el inglés que ya está entre los alternos.
  const titulo = idioma === 'en' ? (tituloIngles(n) ?? n.titulo) : n.titulo;
  return {
    ...n,
    titulo,
    // También en español: muchas sinopsis llegaron en inglés (AniList, MangaDex)
    // y su versión española vive en el caché. Antes el idioma base se servía tal
    // cual y la ficha española enseñaba la sinopsis en inglés.
    sinopsis: traducirTexto(n.sinopsis, idioma),
    sinopsisOriginal: n.sinopsis,
    categorias: generosEn(n.categorias, idioma),
    // El título del idioma actual deja de ser "alterno" y el canónico pasa a
    // serlo: en /en/ el nombre en español es uno de los nombres alternativos.
    titulosAlternativos: [n.titulo, ...n.titulosAlternativos].filter((x) => x !== titulo),
  };
}

function localizarCapitulo(c: Capitulo, idioma: Idioma): Capitulo {
  if (idioma === IDIOMA_BASE) return c;
  return {
    ...c,
    titulo: traducir(c.titulo, idioma),
    contenidoTexto: traducirTexto(c.contenidoTexto, idioma),
  };
}

/**
 * Trae todas las filas de una tabla saltando el corte de 1000 por request que
 * impone Supabase Cloud. Sin esto, el catálogo se queda mudo en la obra 1001.
 */
/**
 * ⚠ CÓMO SE LEE UNA TABLA GRANDE, Y POR QUÉ ASÍ
 * ─────────────────────────────────────────────────────────────────────────────
 * Dos trampas, las dos silenciosas, las dos medidas sobre `capitulos_externos`
 * (264.832 filas):
 *
 * 1. **Sin un orden TOTAL se pierden filas.** `range()` es OFFSET/LIMIT, y
 *    Postgres solo garantiza qué filas caen en cada página si el ORDER BY las
 *    desempata a todas. `order('numero')` no lo hace —miles de obras comparten
 *    el capítulo 1— y las empatadas salen en distinto orden en cada página:
 *
 *      sin ORDER BY            → 168.659 distintas: 96.173 perdidas (36 %)
 *      order(numero desc)      → 264.812 distintas: 20 perdidas
 *      order(id)               → 264.832 distintas: ninguna
 *
 * 2. **El OFFSET profundo es cuadrático.** La página 265 obliga a recorrer y
 *    tirar 264.000 filas antes de devolver 1.000. Con `numero desc` encima
 *    —que no tiene índice propio, así que hay que ordenar la tabla entera cada
 *    vez— la capa gratis de Supabase corta con `statement timeout`. Medido:
 *
 *      order(numero desc, id), offset 0  → statement timeout
 *      order(id),             offset 0  → 1.000 filas
 *
 * Así que se pagina por la CLAVE: `... where clave > última order by clave
 * limit 1000`. Recorre el índice primario y cada página cuesta lo mismo, sea
 * la primera o la 265. El orden que necesite la vista se pone en memoria, que
 * ordenar 264.000 filas una vez en JS son milisegundos.
 */
async function todasLasFilas<T>(
  tabla: string,
  columnas: string,
  filtrar: (q: any) => any,
  /** Columna única y ordenable por la que avanzar. La clave primaria. */
  clave = 'id',
): Promise<T[]> {
  const TAMAÑO = 1000;
  const todas: T[] = [];
  let ultima: unknown = null;
  for (;;) {
    // Un hipo de red en una sola página dejaba el mapa vacío y publicaba el
    // sitio en blanco. Reintentar tapa el corte transitorio; si persiste, se
    // propaga y ABORTA el build —Cloudflare conserva el último deploy bueno—.
    const { data, error } = await conReintentos(() => {
      let q = filtrar(supabase!.from(tabla).select(columnas)).order(clave).limit(TAMAÑO);
      if (ultima !== null) q = q.gt(clave, ultima);
      return q;
    }, `${tabla}[tras ${String(ultima ?? 'inicio')}]`);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    todas.push(...(data as T[]));
    if (data.length < TAMAÑO) break;
    ultima = (data[data.length - 1] as any)[clave];
    // Si la columna clave no viene en el `select`, no hay por dónde avanzar y
    // el bucle sería infinito. Mejor fallar aquí, y en el build, que colgarse.
    if (ultima === undefined) throw new Error(`${tabla}: falta '${clave}' en el select`);
  }
  return todas;
}

/**
 * Reintenta una lectura de Supabase ante fallo transitorio (error de red o
 * `error` en la respuesta). Tras agotar los intentos, lanza: quien lo llama
 * debe dejar que reviente el build, no tragarse el vacío.
 */
async function conReintentos(
  leer: () => PromiseLike<{ data: any; error: any }>,
  etiqueta: string,
  intentos = 3,
): Promise<{ data: any; error: any }> {
  for (let i = 1; ; i++) {
    try {
      const r = await leer();
      if (!r.error) return r;
      if (i >= intentos) return r; // devuelve el error para el mensaje del caller
    } catch (e) {
      if (i >= intentos) throw e;
    }
    console.warn(`[reintento ${i}/${intentos}] ${etiqueta}`);
    await new Promise((s) => setTimeout(s, 500 * i));
  }
}

/**
 * El catálogo, una sola vez por build. Cada página lo pide y son cientos de
 * páginas × 7 idiomas: sin este memo serían miles de requests idénticos.
 *
 * Si no hay Supabase —o la tabla `obras` está vacía— cae a mockData y el sitio
 * compila igual. Es lo que permite clonar el repo y correr `npm run dev` sin
 * credenciales.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * La tabla `fuentes`, UNA vez por build
 * ─────────────────────────────────────────────────────────────────────────────
 * Tres cosas distintas salen de la misma tabla —el nombre de cada fuente, la
 * portada que vio al descubrir, y cuándo recibió capítulo nuevo— y antes eran
 * tres lecturas paginadas de miles de filas. Ahora es una y las tres se derivan
 * de ella; añadir un cuarto dato de `fuentes` ya no cuesta otra pasada.
 */
export interface FilaFuente {
  id: string;
  obra_slug: string;
  nombre: string;
  portada_vista: string | null;
  /** Cuándo creció por última vez. Lo pone scrapear.mjs, no cada corrida. */
  ultimo_cambio: string | null;
  tipo: 'manhwa' | 'novela';
  idioma: string;
}

let fuentesCache: Promise<FilaFuente[]> | null = null;
function cargarFuentes(): Promise<FilaFuente[]> {
  fuentesCache ??= (async () => {
    if (!supabase) return [];
    try {
      return await todasLasFilas<FilaFuente>(
        'fuentes',
        'id, obra_slug, nombre, portada_vista, ultimo_cambio, tipo, idioma',
        (q) => q,
      );
    } catch (e) {
      console.warn(`[fuentes] ${(e as Error).message}`);
      return [];
    }
  })();
  return fuentesCache;
}

/**
 * Hosts de portada que se prueban los ÚLTIMOS, aunque sean la `portada_url` de
 * la obra. No se borran: si una obra no tiene otra candidata, peor es nada.
 *
 * - `mangadex`: bloquea el hotlinking. Su URL carga 200 pero es un cartel
 *   "You can read this at MangaDex", no la portada; `onerror` no lo atrapa.
 * - `imageshack`: el host está muerto. Medido sobre el catálogo publicado, 14
 *   de 15 URLs muestreadas dan 404 — son ~2.520 obras, el 38 %. Como
 *   `obras.portada_url` va primero en la lista y `descubrir.mjs` NUNCA la
 *   reescribe (su upsert usa `ignoreDuplicates`), esa URL muerta ganaba
 *   siempre y tapaba la portada buena que sí trae `fuentes.portada_vista`.
 */
const AL_FINAL = /mangadex|imageshack/i;

/**
 * La portada que vio cada fuente, agrupada por obra. Sirve de respaldo: muchas
 * `portada_url` de scans terminan en link roto, y así el cliente cae a otra
 * fuente en vez de a un ícono roto.
 */
async function portadasPorObra(): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  for (const f of await cargarFuentes()) {
    if (!f.portada_vista) continue;
    const arr = mapa.get(f.obra_slug) ?? mapa.set(f.obra_slug, []).get(f.obra_slug)!;
    if (!arr.includes(f.portada_vista)) arr.push(f.portada_vista);
  }
  return mapa;
}

/**
 * Qué obras recibieron capítulo nuevo, de lo más reciente a lo más viejo. Es la
 * señal de frescura del sitio: la usa /novedades, el RSS y el aviso a los
 * buscadores. Sale de `ultimo_cambio`, que solo se toca cuando una fuente
 * CRECIÓ — re-scrapear sin novedades no la mueve, así que no hay falsa frescura.
 */
export interface Actividad {
  slug: string;
  cuando: string;
  fuentes: string[];
}

let actividadCache: Promise<Actividad[]> | null = null;
export function getActividad(): Promise<Actividad[]> {
  actividadCache ??= (async () => {
    const porObra = new Map<string, Actividad>();
    for (const f of await cargarFuentes()) {
      if (!f.ultimo_cambio) continue;
      const prev = porObra.get(f.obra_slug);
      if (!prev) porObra.set(f.obra_slug, { slug: f.obra_slug, cuando: f.ultimo_cambio, fuentes: [f.nombre] });
      else {
        if (f.ultimo_cambio > prev.cuando) prev.cuando = f.ultimo_cambio;
        if (!prev.fuentes.includes(f.nombre)) prev.fuentes.push(f.nombre);
      }
    }
    return [...porObra.values()].sort((a, b) => b.cuando.localeCompare(a.cuando));
  })();
  return actividadCache;
}

let catalogoCache: Promise<Novela[]> | null = null;

function catalogo(): Promise<Novela[]> {
  catalogoCache ??= (async () => {
    if (!supabase) return novelas;
    try {
      const [todas, portadasFuente] = await Promise.all([
        // `slug` es la clave primaria de `obras`. El orden de presentación
        // (destacadas primero, luego por título) se pone abajo, en memoria.
        todasLasFilas<any>('obras', '*', (q) => q.eq('publicada', true), 'slug'),
        portadasPorObra(),
      ]);
      if (!todas.length) return novelas;
      // Sexualización de menores: no se publica, ni con noindex. El descubridor
      // las vuelve a traer cada noche, así que el filtro vive aquí y no en la BD.
      const filas = todas.filter((o) => !esProhibida(o.categorias ?? []));
      // Destacadas primero y luego por título: el orden que espera la portada.
      // Antes lo pedía la base; ahora la base solo pagina por clave primaria.
      filas.sort(
        (a, b) =>
          Number(b.destacada) - Number(a.destacada) || String(a.titulo).localeCompare(String(b.titulo), 'es'),
      );
      return filas.map((o) => {
        // Candidatos: la principal + las que vio cada fuente. Solo URLs http
        // (los placeholders internos ya son el último recurso), sin repetir.
        // MangaDex bloquea el hotlinking: su URL carga 200 pero es un cartel
        // "You can read this at MangaDex", no la portada. onerror no lo atrapa
        // (no falla), así que va al final: solo se usa si no hay otra fuente.
        const candidatos = [o.portada_url, ...(portadasFuente.get(o.slug) ?? [])]
          .filter((u, i, a) => u && /^https?:\/\//.test(u) && a.indexOf(u) === i)
          .sort((a, b) => Number(AL_FINAL.test(a)) - Number(AL_FINAL.test(b)));
        return {
          id: o.slug,
          slug: o.slug,
          tipo: o.tipo,
          titulo: o.titulo,
          titulosAlternativos: o.titulos_alternativos ?? [],
          sinopsis: o.sinopsis ?? '',
          // La portada se sirve por NUESTRO dominio (ver functions/portada/):
          // así la indexa Google Imágenes a nuestro nombre y no al de la scan,
          // y el og:image deja de ser de un tercero. Se cambia AQUÍ, que es por
          // donde pasan las ~12 plantillas que pintan una portada.
          // En `dev` no hay funciones de Cloudflare, así que ahí va el origen.
          portadaUrl: candidatos.length
            ? import.meta.env.PROD
              ? `/portada/${o.slug}.jpg`
              : candidatos[0]
            : '/portadas/sin-portada.svg',
          // Las de origen siguen aquí: son el respaldo por JS de `data-fb` y la
          // lista que consume /portadas.json para decirle al proxy qué probar.
          portadas: candidatos,
          estado: o.estado,
          categorias: o.categorias ?? [],
          creadaEn: o.creada_en,
        };
      }) as Novela[];
    } catch (e) {
      console.warn(`[catalogo] ${(e as Error).message} — usando mock`);
      return novelas;
    }
  })();
  return catalogoCache;
}

/**
 * Slugs con contenido de verdad: capítulos (externos o internos) o sinopsis.
 * El descubridor mete miles de obras "publicadas" que aún no tienen NADA
 * indexado; su ficha sería una página vacía. Publicar esas ~8.000 obras × 7
 * idiomas eran 56.000 páginas fantasma que reventaban el tiempo de build de
 * Cloudflare (y son thin content para Google). Aquí se filtran.
 */
let conContenidoCache: Promise<Set<string>> | null = null;
function obrasConContenido(): Promise<Set<string>> {
  conContenidoCache ??= (async () => {
    const conCaps = new Set<string>((await cargarExternos()).keys());
    for (const n of await catalogo()) {
      if (n.sinopsis?.trim() || capitulosDe(n.slug).length) conCaps.add(n.slug);
    }
    return conCaps;
  })();
  return conContenidoCache;
}

/** UNA vez por idioma: getNovelas la llaman ~10.000 páginas, y localizar (hash
 *  de cada párrafo de sinopsis, géneros) 10.000 obras en cada una no cabe en el
 *  build. Todas las páginas reciben el mismo array: no se muta. */
const novelasPorIdioma = new Map<Idioma, Promise<Novela[]>>();

export function getNovelas(idioma: Idioma = IDIOMA_BASE): Promise<Novela[]> {
  let lista = novelasPorIdioma.get(idioma);
  if (!lista) {
    lista = (async () => {
      const publicables = await obrasConContenido();
      return (await catalogo()).filter((n) => publicables.has(n.slug)).map((n) => localizarNovela(n, idioma));
    })();
    novelasPorIdioma.set(idioma, lista);
  }
  return lista;
}

export async function getNovela(slug: string, idioma: Idioma = IDIOMA_BASE) {
  return (await getNovelas(idioma)).find((x) => x.slug === slug);
}

export async function getCapitulos(slug: string, idioma: Idioma = IDIOMA_BASE): Promise<Capitulo[]> {
  return capitulosDe(slug).map((c) => localizarCapitulo(c, idioma));
}

export async function getCapitulo(slug: string, numero: number, idioma: Idioma = IDIOMA_BASE) {
  const c = capitulosDe(slug).find((x) => x.numero === numero);
  return c && localizarCapitulo(c, idioma);
}

/**
 * Toda la tabla `equivalencias` en UNA lectura, agrupada por slug. Con cientos
 * de obras, preguntar una por una eran cientos de requests en el build; así es
 * una sola. La tabla es diminuta (anclas a mano), cabe entera en memoria.
 */
let equivalenciasCache: Promise<Map<string, EquivalenciaManhwa[]>> | null = null;

function cargarEquivalencias(): Promise<Map<string, EquivalenciaManhwa[]>> {
  equivalenciasCache ??= (async () => {
    const mapa = new Map<string, EquivalenciaManhwa[]>();
    if (!supabase) {
      for (const [slug, eqs] of Object.entries(equivalencias)) mapa.set(slug, eqs);
      return mapa;
    }
    try {
      // `equivalencias` NO puede usar `todasLasFilas`: su clave es compuesta
      // (novela_slug, capitulo_manhwa) y avanzar con `> novela_slug` se saltaría
      // el resto de anclas de esa misma obra en cuanto una cruce el corte de
      // página. Es una tabla pequeña —anclas puestas a mano—, así que va por
      // OFFSET, que con el orden TOTAL de su clave primaria sí es correcto.
      const filas: any[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await conReintentos(
          () =>
            supabase!
              .from('equivalencias')
              .select('novela_slug, capitulo_manhwa, capitulo_novela')
              .order('novela_slug')
              .order('capitulo_manhwa')
              .range(desde, desde + 999),
          `equivalencias[${desde}]`,
        );
        if (error) throw new Error(error.message);
        if (!data?.length) break;
        filas.push(...data);
        if (data.length < 1000) break;
      }
      for (const e of filas) {
        const lista = mapa.get(e.novela_slug) ?? mapa.set(e.novela_slug, []).get(e.novela_slug)!;
        lista.push({ capituloManhwa: e.capitulo_manhwa, capituloNovela: e.capitulo_novela });
      }
    } catch (e) {
      console.warn(`[equivalencias] ${(e as Error).message} — usando mock`);
      for (const [slug, eqs] of Object.entries(equivalencias)) mapa.set(slug, eqs);
    }
    return mapa;
  })();
  return equivalenciasCache;
}

export async function getEquivalencias(slug: string): Promise<EquivalenciaManhwa[]> {
  return (await cargarEquivalencias()).get(slug) ?? equivalencias[slug] ?? [];
}

/**
 * Equivalencias aportadas por la comunidad, con consenso: por cada (obra,
 * capítulo de manhwa), el capítulo de novela MÁS votado. Solo build.
 */
let sugeridasCache: Promise<Map<string, EquivalenciaManhwa[]>> | null = null;
function cargarSugeridas(): Promise<Map<string, EquivalenciaManhwa[]>> {
  sugeridasCache ??= (async () => {
    const mapa = new Map<string, EquivalenciaManhwa[]>();
    if (!supabase) return mapa;
    try {
      const filas = await todasLasFilas<any>(
        'equivalencias_sugeridas',
        'id, obra_slug, capitulo_manhwa, capitulo_novela',
        (q) => q,
      );
      const votos = new Map<string, Map<number, Map<number, number>>>();
      for (const f of filas) {
        const obra = votos.get(f.obra_slug) ?? votos.set(f.obra_slug, new Map()).get(f.obra_slug)!;
        const manhwa = obra.get(f.capitulo_manhwa) ?? obra.set(f.capitulo_manhwa, new Map()).get(f.capitulo_manhwa)!;
        manhwa.set(f.capitulo_novela, (manhwa.get(f.capitulo_novela) ?? 0) + 1);
      }
      for (const [slug, porManhwa] of votos) {
        const anclas: EquivalenciaManhwa[] = [];
        for (const [capituloManhwa, opciones] of porManhwa) {
          let capituloNovela = 0;
          let max = -1;
          for (const [nov, n] of opciones) if (n > max) ((max = n), (capituloNovela = nov));
          anclas.push({ capituloManhwa, capituloNovela });
        }
        mapa.set(slug, anclas);
      }
    } catch (e) {
      console.warn(`[sugeridas] ${(e as Error).message}`);
    }
    return mapa;
  })();
  return sugeridasCache;
}

/** Admin + comunidad fusionadas (el admin manda). Para pintar en el build. */
export async function getEquivalenciasCombinadas(slug: string): Promise<EquivalenciaManhwa[]> {
  const [admin, com] = await Promise.all([cargarEquivalencias(), cargarSugeridas()]);
  const fusion = new Map<number, number>();
  for (const a of com.get(slug) ?? []) fusion.set(a.capituloManhwa, a.capituloNovela);
  for (const a of admin.get(slug) ?? []) fusion.set(a.capituloManhwa, a.capituloNovela);
  return [...fusion].map(([capituloManhwa, capituloNovela]) => ({ capituloManhwa, capituloNovela }));
}

/**
 * Capítulos indexados de fuentes externas: metadata y enlace al sitio de origen.
 * RLS solo deja leer los aprobados, así que la anon key basta.
 * Sin credenciales devuelve [] y la sección simplemente no se pinta.
 */
/**
 * TODA la tabla `capitulos_externos` en una sola pasada paginada, agrupada por
 * slug y ordenada por número desc. Antes era una consulta por obra: con ~950
 * obras, ~950 requests que hacían el build de Cloudflare rozar el límite de 20
 * min. Ahora son unas pocas páginas de 1000 filas. Los 40k+ capítulos son filas
 * chicas (metadata + enlace), caben de sobra en memoria.
 */
/** id de fuente → su nombre. Deriva de la lectura única de `fuentes`. */
async function cargarNombresFuente(): Promise<Map<string, string>> {
  return new Map((await cargarFuentes()).map((f) => [f.id, f.nombre]));
}

let externosCache: Promise<Map<string, CapituloExterno[]>> | null = null;

function cargarExternos(): Promise<Map<string, CapituloExterno[]>> {
  externosCache ??= (async () => {
    const mapa = new Map<string, CapituloExterno[]>();
    if (!supabase) {
      console.warn('[externos] SIN CLIENTE — falta PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY en el build');
      return mapa;
    }
    try {
      const nombres = await cargarNombresFuente();
      const filas = await todasLasFilas<any>(
        'capitulos_externos',
        // `id` va en el select porque es la clave por la que se pagina: sin
        // ella no hay por dónde avanzar. Lo grita `todasLasFilas`, no se cuelga.
        'id, obra_slug, numero, titulo, url, fecha_texto, idioma, tipo, fuente_id',
        // Se pagina por la CLAVE PRIMARIA y nada más. Ordenar por `numero desc`
        // obliga a Postgres a ordenar las 264.000 filas enteras en cada una de
        // las 265 páginas —no hay índice por `numero` solo— y en la capa gratis
        // eso acaba en `statement timeout`. Por `id` recorre el índice y ya.
        //
        // El orden que la ficha necesita (capítulo más nuevo primero) se pone
        // abajo, en memoria: ordenar 264.000 filas una vez en JS son
        // milisegundos; hacérselo pedir 265 veces a la base es lo que se caía.
        (q) => q.eq('aprobado', true).order('id'),
      );
      for (const f of filas) {
        const lista = mapa.get(f.obra_slug) ?? mapa.set(f.obra_slug, []).get(f.obra_slug)!;
        lista.push({ ...f, fuenteId: f.fuente_id, fuenteNombre: nombres.get(f.fuente_id) ?? '' });
      }
      // Del más nuevo al más viejo, que es como se listan y como `fuentesDe`
      // recorta a TOPE_RENDER. Los que no traen número van al final.
      for (const lista of mapa.values()) {
        lista.sort((a, b) => (b.numero ?? -1) - (a.numero ?? -1));
      }
      console.log(`[externos] ${filas.length} capítulos en ${mapa.size} obras`);
    } catch (e) {
      // NO devolver un mapa vacío: sin capítulos externos, TODAS las obras
      // pierden el formato y el grid "manhwa y novela" sale en 0. Abortar el
      // build es lo correcto —Cloudflare mantiene el último deploy bueno—.
      throw new Error(`[externos] lectura falló, se aborta el build para no publicar vacío: ${(e as Error).message}`);
    }
    return mapa;
  })();
  return externosCache;
}

export async function getCapitulosExternos(slug: string): Promise<CapituloExterno[]> {
  return (await cargarExternos()).get(slug) ?? [];
}

export interface FuenteVersion {
  fuenteId: string;
  nombre: string;
  tipo: 'manhwa' | 'novela';
  idioma: string;
  dominio: string;
  capitulos: CapituloExterno[];
  ultimo: number;
  /**
   * Cuántos capítulos anunciar en la tarjeta. Para fuentes con lista completa
   * es el nº indexado; para las "link-out" (Olympus), que traen una sola fila
   * con el total en `numero`, es ese total. Por eso es el máximo de los dos.
   */
  total: number;
  /** Link-out: una fuente que no lista capítulos, solo enlaza a la serie. */
  soloEnlace: boolean;
  /** true si `capitulos` viene recortado a TOPE_RENDER (el resto vive en la fuente). */
  recortada: boolean;
}

/**
 * Techo de capítulos por fuente que se escupen al HTML. Era 200 para sobrevivir
 * al ×7 idiomas (miles de <li> × 7 = OOM en Cloudflare). Ahora el catálogo va
 * solo en `es` (idiomasDeObra), así que se puede mostrar la lista completa; el
 * tope solo acota casos patológicos (una fuente con 5.000+ capítulos).
 * ponytail: si el build empieza a sufrir, bájalo; siempre queda el enlace
 * "ver todos en la fuente" cuando recorta.
 */
const TOPE_RENDER = 3000;

const dominioDe = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Los capítulos de una obra agrupados POR SCAN, como zonascans: cada fuente es
 * su propia tarjeta —"Samurai Scan · manhwa · es · 240 caps"— con sus capítulos
 * y su enlace al sitio original. El lector elige el scan y lee ahí.
 *
 * Orden: primero por número de capítulos (la fuente más completa arriba). Así
 * la respuesta a "¿dónde hay más?" queda de primera, que es a lo que se viene.
 */
export function fuentesDe(externos: CapituloExterno[]): FuenteVersion[] {
  const grupos = new Map<string, CapituloExterno[]>();
  for (const c of externos) {
    if (!grupos.has(c.fuenteId)) grupos.set(c.fuenteId, []);
    grupos.get(c.fuenteId)!.push(c);
  }
  return [...grupos.values()]
    .map((capitulos) => {
      const c0 = capitulos[0];
      const numeros = capitulos.map((c) => c.numero).filter((n): n is number => n !== null);
      const ultimo = numeros.length ? Math.max(...numeros) : 0;
      return {
        fuenteId: c0.fuenteId,
        nombre: c0.fuenteNombre || dominioDe(c0.url),
        tipo: c0.tipo,
        idioma: c0.idioma,
        dominio: dominioDe(c0.url),
        // Solo los últimos TOPE_RENDER van al HTML; total/ultimo siguen siendo
        // los reales (se calculan sobre la lista completa, arriba).
        capitulos: capitulos.slice(0, TOPE_RENDER),
        ultimo,
        total: Math.max(capitulos.length, ultimo),
        recortada: capitulos.length > TOPE_RENDER,
        // Una sola fila cuyo enlace no apunta a un capítulo concreto sino a la
        // serie: es una fuente link-out (Olympus). Se muestra como "Ver serie".
        soloEnlace: capitulos.length === 1 && ultimo > 1,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Qué formatos existen de la obra, para el aviso "Manhwa · Novela". */
export function formatos(externos: CapituloExterno[]): ('manhwa' | 'novela')[] {
  return [...new Set(externos.map((c) => c.tipo))].sort();
}

export { manhwaANovela } from './equivalencia';
