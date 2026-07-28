export interface Novela {
  id: string;
  slug: string;
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

export interface UserProgress {
  userId?: string;
  novelaSlug: string;
  capitulosLeidos: number[];
  esFavorito: boolean;
}
