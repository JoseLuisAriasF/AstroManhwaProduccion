import type { EquivalenciaManhwa } from '@/types/novela';

/**
 * Manhwa -> novela. Interpola linealmente entre anclas y extrapola con el
 * ritmo del último tramo. Devuelve null si no hay datos para esa novela.
 *
 * Vive aparte de api.ts (y sin imports de runtime) para poder probarse suelto:
 *   node --experimental-strip-types src/lib/api.test.ts
 */
export function manhwaANovela(anclas: EquivalenciaManhwa[], capManhwa: number): number | null {
  if (anclas.length === 0 || capManhwa < 1) return null;
  const a = [...anclas].sort((x, y) => x.capituloManhwa - y.capituloManhwa);

  const exacto = a.find((e) => e.capituloManhwa === capManhwa);
  if (exacto) return exacto.capituloNovela;

  // Fuera del rango de anclas: null. Extrapolar con pendiente local da
  // resultados absurdos (el manhwa avanza a distinto ritmo en distintas
  // partes de la historia). Mejor decir "no tenemos suficientes datos".
  if (capManhwa < a[0].capituloManhwa) return null;

  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i];
    const hi = a[i + 1];
    if (capManhwa > lo.capituloManhwa && capManhwa < hi.capituloManhwa) {
      const ratio = (capManhwa - lo.capituloManhwa) / (hi.capituloManhwa - lo.capituloManhwa);
      return Math.round(lo.capituloNovela + ratio * (hi.capituloNovela - lo.capituloNovela));
    }
  }

  // Más allá de la última ancla: null. Misma lógica que hacia atrás.
  return null;
}
