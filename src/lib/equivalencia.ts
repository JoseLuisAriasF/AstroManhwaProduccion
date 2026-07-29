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

  // Antes del primer ancla: extrapola con la pendiente del PRIMER tramo,
  // simétrico al comportamiento hacia adelante. Con anclas 145→207 y
  // 150→210 la pendiente es 0.6, así manhwa 100 ≈ novela 180.
  if (capManhwa < a[0].capituloManhwa) {
    if (a.length === 1) return a[0].capituloNovela;
    const p = a[1];
    const pendiente =
      (p.capituloNovela - a[0].capituloNovela) / (p.capituloManhwa - a[0].capituloManhwa);
    return Math.max(1, Math.round(a[0].capituloNovela - (a[0].capituloManhwa - capManhwa) * pendiente));
  }

  for (let i = 0; i < a.length - 1; i++) {
    const lo = a[i];
    const hi = a[i + 1];
    if (capManhwa > lo.capituloManhwa && capManhwa < hi.capituloManhwa) {
      const ratio = (capManhwa - lo.capituloManhwa) / (hi.capituloManhwa - lo.capituloManhwa);
      return Math.round(lo.capituloNovela + ratio * (hi.capituloNovela - lo.capituloNovela));
    }
  }

  // Más allá de la última ancla: extrapola con la pendiente del último tramo.
  const ultimo = a[a.length - 1];
  if (a.length === 1) return ultimo.capituloNovela;
  const previo = a[a.length - 2];
  const pendiente =
    (ultimo.capituloNovela - previo.capituloNovela) /
    (ultimo.capituloManhwa - previo.capituloManhwa);
  return Math.round(ultimo.capituloNovela + (capManhwa - ultimo.capituloManhwa) * pendiente);
}
