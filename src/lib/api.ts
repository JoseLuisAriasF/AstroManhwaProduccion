import type { Capitulo, CapituloExterno, EquivalenciaManhwa, Novela } from '@/types/novela';
import { IDIOMA_BASE, type Idioma } from './i18n';
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
  if (idioma === IDIOMA_BASE) return n;
  const titulo = traducir(n.titulo, idioma);
  return {
    ...n,
    titulo,
    sinopsis: traducirTexto(n.sinopsis, idioma),
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
async function todasLasFilas<T>(tabla: string, columnas: string, filtrar: (q: any) => any): Promise<T[]> {
  const TAMAÑO = 1000;
  const todas: T[] = [];
  for (let desde = 0; ; desde += TAMAÑO) {
    const { data, error } = await filtrar(supabase!.from(tabla).select(columnas)).range(
      desde,
      desde + TAMAÑO - 1,
    );
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    todas.push(...(data as T[]));
    if (data.length < TAMAÑO) break;
  }
  return todas;
}

/**
 * El catálogo, una sola vez por build. Cada página lo pide y son cientos de
 * páginas × 7 idiomas: sin este memo serían miles de requests idénticos.
 *
 * Si no hay Supabase —o la tabla `obras` está vacía— cae a mockData y el sitio
 * compila igual. Es lo que permite clonar el repo y correr `npm run dev` sin
 * credenciales.
 */
let catalogoCache: Promise<Novela[]> | null = null;

function catalogo(): Promise<Novela[]> {
  catalogoCache ??= (async () => {
    if (!supabase) return novelas;
    try {
      const filas = await todasLasFilas<any>('obras', '*', (q) =>
        q.eq('publicada', true).order('destacada', { ascending: false }).order('titulo'),
      );
      if (!filas.length) return novelas;
      return filas.map((o) => ({
        id: o.slug,
        slug: o.slug,
        tipo: o.tipo,
        titulo: o.titulo,
        titulosAlternativos: o.titulos_alternativos ?? [],
        sinopsis: o.sinopsis ?? '',
        portadaUrl: o.portada_url || '/portadas/espadachin.svg',
        estado: o.estado,
        categorias: o.categorias ?? [],
      })) as Novela[];
    } catch (e) {
      console.warn(`[catalogo] ${(e as Error).message} — usando mock`);
      return novelas;
    }
  })();
  return catalogoCache;
}

export async function getNovelas(idioma: Idioma = IDIOMA_BASE): Promise<Novela[]> {
  return (await catalogo()).map((n) => localizarNovela(n, idioma));
}

export async function getNovela(slug: string, idioma: Idioma = IDIOMA_BASE) {
  const n = (await catalogo()).find((x) => x.slug === slug);
  return n && localizarNovela(n, idioma);
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
      const filas = await todasLasFilas<any>('equivalencias', 'novela_slug, capitulo_manhwa, capitulo_novela', (q) =>
        q.order('capitulo_manhwa'),
      );
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
/** id de fuente → su nombre, en una lectura. RLS deja leer el nombre a anon. */
let nombresFuenteCache: Promise<Map<string, string>> | null = null;
function cargarNombresFuente(): Promise<Map<string, string>> {
  nombresFuenteCache ??= (async () => {
    const mapa = new Map<string, string>();
    try {
      const filas = await todasLasFilas<any>('fuentes', 'id, nombre', (q) => q);
      for (const f of filas) mapa.set(f.id, f.nombre);
    } catch (e) {
      console.warn(`[fuentes] ${(e as Error).message}`);
    }
    return mapa;
  })();
  return nombresFuenteCache;
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
        'obra_slug, numero, titulo, url, fecha_texto, idioma, tipo, fuente_id',
        (q) => q.eq('aprobado', true).order('numero', { ascending: false, nullsFirst: false }),
      );
      for (const f of filas) {
        const lista = mapa.get(f.obra_slug) ?? mapa.set(f.obra_slug, []).get(f.obra_slug)!;
        lista.push({ ...f, fuenteId: f.fuente_id, fuenteNombre: nombres.get(f.fuente_id) ?? '' });
      }
      console.log(`[externos] ${filas.length} capítulos en ${mapa.size} obras`);
    } catch (e) {
      console.warn(`[externos] ${(e as Error).message}`);
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
 * Cuántos capítulos de cada fuente se escupen al HTML. La ficha es un directorio
 * "dónde leerla" que enlaza a la fuente original —ahí está la lista completa—,
 * así que no hace falta incrustar miles de <li> por obra. Sin este tope, con
 * decenas de miles de capítulos externos × 7 idiomas el build de Cloudflare se
 * queda sin memoria (OOM) y muere a los ~25 min.
 * ponytail: sube el número si el build aguanta; lo que se corta son los caps
 * más viejos, y siempre queda el enlace "ver todos en la fuente".
 */
const TOPE_RENDER = 200;

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
