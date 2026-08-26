/**
 * Una obra del catálogo. Se sigue llamando `Novela` porque así se llama la ruta
 * pública `/novela/[slug]`, que ya está indexada y no se toca; pero desde que
 * el catálogo incluye manhwas, `tipo` es lo que dice qué es cada una.
 */
export interface Novela {
  id: string;
  slug: string;
  /** Qué formatos existen de esta obra. Decide qué listas muestra su ficha. */
  tipo: 'manhwa' | 'novela' | 'ambos';
  titulo: string;
  /**
   * Cómo se busca esta obra en otros idiomas: título en inglés, portugués,
   * romanización coreana, siglas del fandom… El lector portugués que busca
   * "capítulo 12 de <título en portugués>" tiene que caer en esta página.
   * Se usan en <title>, meta description, JSON-LD alternateName, buscador
   * interno y texto visible (que es lo que Google realmente indexa).
   */
  titulosAlternativos: string[];
  sinopsis: string;
  portadaUrl: string; // Única imagen por novela
  estado: 'En emisión' | 'Finalizado';
  categorias: string[];
}

export interface EquivalenciaManhwa {
  capituloManhwa: number;
  capituloNovela: number;
}

export interface Capitulo {
  id: string;
  novelaSlug: string;
  numero: number;
  titulo: string;
  contenidoTexto: string; // Solo texto
  fechaPublicacion: string;
  equivalenciaManhwa?: number;
}

/**
 * Capítulo que vive en otro sitio. Guardamos el índice y enlazamos; el texto
 * nunca se copia, el lector lo lee en la fuente original.
 */
export interface CapituloExterno {
  numero: number | null;
  titulo: string;
  url: string;
  fecha_texto: string | null;
  /**
   * De qué versión viene. Es el punto entero del agregador: el manhwa en
   * inglés suele ir 50 capítulos por delante del español, y la novela cientos
   * por delante del manhwa. Cada combinación es su propia lista.
   */
  idioma: string;
  tipo: 'manhwa' | 'novela';
  /** Qué fuente (scan) lo publicó. La ficha agrupa por scan, como zonascans. */
  fuenteId: string;
  fuenteNombre: string;
}

export interface UserProgress {
  userId?: string;
  novelaSlug: string;
  capitulosLeidos: number[];
  esFavorito: boolean;
}
