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

export async function getNovelas(idioma: Idioma = IDIOMA_BASE): Promise<Novela[]> {
  return novelas.map((n) => localizarNovela(n, idioma));
}

export async function getNovela(slug: string, idioma: Idioma = IDIOMA_BASE) {
  const n = novelas.find((x) => x.slug === slug);
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
  return equivalencias[slug] ?? [];
}

/**
 * Capítulos indexados de fuentes externas: metadata y enlace al sitio de origen.
 * RLS solo deja leer los aprobados, así que la anon key basta.
 * Sin credenciales devuelve [] y la sección simplemente no se pinta.
 */
export async function getCapitulosExternos(slug: string): Promise<CapituloExterno[]> {
  if (!supabase) {
    console.warn(`[externos:${slug}] SIN CLIENTE — falta PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY en el build`);
    return [];
  }
  const { data, error } = await supabase
    .from('capitulos_externos')
    .select('numero, titulo, url, fecha_texto')
    .eq('novela_slug', slug)
    .eq('aprobado', true)
    .order('numero', { ascending: false, nullsFirst: false });
  if (error) {
    console.warn(`[externos:${slug}] error: ${error.message}`);
    return [];
  }
  console.log(`[externos:${slug}] ${data?.length ?? 0} filas`);
  return data ?? [];
}

export { manhwaANovela } from './equivalencia';
