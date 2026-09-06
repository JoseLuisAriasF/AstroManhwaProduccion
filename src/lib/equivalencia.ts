// Ruta relativa y no el alias `@/`: este módulo lo importa también la función
// del edge (functions/novela/…), que la bundlea Wrangler y no conoce los alias
// de Astro. Es lo único que hace falta para compartir la fórmula en vez de
// tener dos que se separan con el tiempo.
import type { EquivalenciaManhwa } from '../types/novela';

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

  if (capManhwa < a[0].capituloManhwa) return a[0].capituloNovela;

  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i];
    const hi = a[i + 1];
    if (capManhwa > lo.capituloManhwa && capManhwa < hi.capituloManhwa) {
      const ratio = (capManhwa - lo.capituloManhwa) / (hi.capituloManhwa - lo.capituloManhwa);
      return Math.round(lo.capituloNovela + ratio * (hi.capituloNovela - lo.capituloNovela));
    }
  }

  // Más allá de la última ancla: extrapola con la pendiente del tramo final.
  const ultimo = a[a.length - 1];
  if (a.length === 1) return ultimo.capituloNovela;
  const previo = a[a.length - 2];
  const pendiente =
    (ultimo.capituloNovela - previo.capituloNovela) /
    (ultimo.capituloManhwa - previo.capituloManhwa);
  return Math.round(ultimo.capituloNovela + (capManhwa - ultimo.capituloManhwa) * pendiente);
}
