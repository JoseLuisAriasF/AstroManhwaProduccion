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

export async function getEquivalencias(slug: string): Promise<EquivalenciaManhwa[]> {
  if (!supabase) return equivalencias[slug] ?? [];
  const { data, error } = await supabase
    .from('equivalencias')
    .select('capitulo_manhwa, capitulo_novela')
    .eq('novela_slug', slug)
    .order('capitulo_manhwa');
  if (error) {
    console.warn(`[equivalencias:${slug}] ${error.message} — usando mock`);
    return equivalencias[slug] ?? [];
  }
  return (data ?? []).map((e) => ({
    capituloManhwa: e.capitulo_manhwa,
    capituloNovela: e.capitulo_novela,
  }));
}

/**
 * Capítulos indexados de fuentes externas: metadata y enlace al sitio de origen.
 * RLS solo deja leer los aprobados, así que la anon key basta.
 * Sin credenciales devuelve [] y la sección simplemente no se pinta.
 */
// ponytail: una consulta por obra. Con ~500 obras son ~500 requests por build
// (memoizados, así que uno por obra y no uno por página × idioma). Si el build
// se hace lento, cambiar a una sola lectura de toda la tabla agrupada por slug.
const externosCache = new Map<string, Promise<CapituloExterno[]>>();

export async function getCapitulosExternos(slug: string): Promise<CapituloExterno[]> {
  if (!supabase) {
    console.warn(`[externos:${slug}] SIN CLIENTE — falta PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY en el build`);
    return [];
  }
  // Cada obra aparece en el índice, en el catálogo y en su ficha, × 7 idiomas.
  // El memo convierte esas ~10 lecturas idénticas por obra en una sola.
  if (!externosCache.has(slug)) {
    externosCache.set(
      slug,
      todasLasFilas<CapituloExterno>('capitulos_externos', 'numero, titulo, url, fecha_texto, idioma, tipo', (q) =>
        q
          .eq('obra_slug', slug)
          .eq('aprobado', true)
          .order('numero', { ascending: false, nullsFirst: false }),
      ).catch((e: Error) => {
        console.warn(`[externos:${slug}] ${e.message}`);
        return [] as CapituloExterno[];
      }),
    );
  }
  return externosCache.get(slug)!;
}

/**
 * Las versiones disponibles de una obra, de la más adelantada a la menos:
 * "novela · en · 1948 caps", "manhwa · es · 173 caps"…
 *
 * Ese orden es el producto. El lector llega buscando el capítulo 174 del
 * manhwa en español, que no existe todavía, y aquí ve que la novela en inglés
 * ya va por el 1948.
 */
export function versiones(externos: CapituloExterno[]) {
  const grupos = new Map<string, CapituloExterno[]>();
  for (const c of externos) {
    const clave = `${c.tipo}|${c.idioma}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(c);
  }
  return [...grupos]
    .map(([clave, capitulos]) => {
      const [tipo, idioma] = clave.split('|');
      const numeros = capitulos.map((c) => c.numero).filter((n): n is number => n !== null);
      return {
        tipo: tipo as 'manhwa' | 'novela',
        idioma,
        capitulos,
        ultimo: numeros.length ? Math.max(...numeros) : 0,
      };
    })
    .sort((a, b) => b.ultimo - a.ultimo);
}

export { manhwaANovela } from './equivalencia';
