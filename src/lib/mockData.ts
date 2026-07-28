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
    portadaUrl: '/portadas/espadachin.svg',
    estado: 'En emisión',
    categorias: ['Artes marciales', 'Regresión', 'Wuxia'],
  },
];

export const equivalencias: Record<string, EquivalenciaManhwa[]> = {};

export function capitulosDe(_slug: string): Capitulo[] {
  return [];
}
