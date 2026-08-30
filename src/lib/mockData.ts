import type { Capitulo, EquivalenciaManhwa, Novela } from '@/types/novela';

/**
 * Catálogo mínimo de prueba: una sola novela cuya "lectura" vive fuera
 * (los capítulos se indexan en `capitulos_externos` con enlace a la fuente).
 * No hay texto propio, así que capitulosDe() devuelve vacío.
 */
export const novelas: Novela[] = [
  {
    id: 'n1',
    slug: 'return-of-the-mount-hua',
    tipo: 'ambos',
    titulo: 'Regreso de la Secta del Monte Hua',
    titulosAlternativos: [
      'Return of the Mount Hua Sect',
      'Return of the Blossoming Blade',
      'Hwasan Jaerim',
      '화산귀환',
      'RotMH',
    ],
    sinopsis:
      'Chung Myung, el trece veces campeón de la secta Hwasan, muere derrotando al Rey Demonio. Cien años después despierta en el cuerpo de un discípulo débil, y Hwasan —antes cumbre del jianghu— hoy es una sombra. Está de vuelta, y no para verla caer.',
    portadaUrl: '/portadas/sin-portada.svg',
    estado: 'En emisión',
    categorias: ['Artes marciales', 'Regresión', 'Wuxia'],
  },
];

/** Fallback si Supabase aún no tiene la tabla `equivalencias`. */
export const equivalencias: Record<string, EquivalenciaManhwa[]> = {
  'return-of-the-mount-hua': [
    { capituloManhwa: 145, capituloNovela: 207 },
    { capituloManhwa: 150, capituloNovela: 210 }, // manhwa 150 abarca novela 210-211
    { capituloManhwa: 155, capituloNovela: 218 },
    { capituloManhwa: 160, capituloNovela: 224 },
    { capituloManhwa: 173, capituloNovela: 240 },
  ],
};

export function capitulosDe(_slug: string): Capitulo[] {
  return [];
}
