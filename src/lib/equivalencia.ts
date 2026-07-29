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

  // Fuera del rango de anclas verificadas: null. Preferimos "no sé" sobre
  // "adivino mal". El sitio muestra el input clampeado al rango real.
  if (capManhwa < a[0].capituloManhwa) return null;
  if (capManhwa > a[a.length - 1].capituloManhwa) return null;

  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i];
    const hi = a[i + 1];
    if (capManhwa > lo.capituloManhwa && capManhwa < hi.capituloManhwa) {
      const ratio = (capManhwa - lo.capituloManhwa) / (hi.capituloManhwa - lo.capituloManhwa);
      return Math.round(lo.capituloNovela + ratio * (hi.capituloNovela - lo.capituloNovela));
    }
  }

  return null; // no debería llegar: los tres casos anteriores cubren el rango
}
