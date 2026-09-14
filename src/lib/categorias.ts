import { getNovelas } from './api';
import { esAdulta, esGeneroAdulto } from './indexacion';
import type { Novela } from '@/types/novela';

/**
 * Páginas de género (/categoria/regresion, /categoria/artes-marciales…).
 *
 * Cada categoría es una página propia, indexable: captura búsquedas de alto
 * volumen ("novelas de regresión", "manhwas de cultivo") que las fichas sueltas
 * no pelean, y de paso teje enlaces internos hacia el catálogo. Son hubs.
 *
 * Solo en el idioma base: las fichas del catálogo se publican en `es`
 * (idiomasDeObra), así que paginar los 7 idiomas sería contenido duplicado.
 */
export const slugCategoria = (c: string) =>
  c
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export interface Genero {
  slug: string;
  nombre: string;
  obras: Novela[];
}

let cache: Promise<Map<string, Genero>> | null = null;

/** Categoría (slug) → { nombre visible, obras }. Una sola pasada por build. */
export function generos(): Promise<Map<string, Genero>> {
  cache ??= (async () => {
    const novelas = await getNovelas();
    const mapa = new Map<string, Genero>();
    for (const n of novelas) {
      // Lo adulto no tiene hub propio (/categoria/hentai) ni se lista en los
      // demás: son las páginas indexables que más pesan en una revisión de AdSense.
      if (esAdulta(n)) continue;
      for (const c of n.categorias) {
        const slug = slugCategoria(c);
        if (!slug || esGeneroAdulto(c)) continue;
        const g = mapa.get(slug) ?? { slug, nombre: c, obras: [] };
        g.obras.push(n);
        mapa.set(slug, g);
      }
    }
    // Doble formato primero (el gancho del sitio), luego alfabético.
    for (const g of mapa.values()) {
      g.obras.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    }
    return mapa;
  })();
  return cache;
}

/** Los géneros con al menos MIN obras, ordenados por tamaño (para el índice). */
export async function generosDestacados(min = 8): Promise<Genero[]> {
  return [...(await generos()).values()]
    .filter((g) => g.obras.length >= min)
    .sort((a, b) => b.obras.length - a.obras.length);
}
