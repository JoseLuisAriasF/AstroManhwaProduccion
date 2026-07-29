/** Agrupa números consecutivos: [1,2,3,5,6,10] → "1-3, 5-6, 10". */
export function rangos(numeros: (number | null)[]): string {
  const orden = [...new Set(numeros.filter((n): n is number => n != null))].sort((a, b) => a - b);
  if (!orden.length) return '';
  const grupos: string[] = [];
  let ini = orden[0], prev = orden[0];
  for (const n of orden.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    grupos.push(ini === prev ? `${ini}` : `${ini}–${prev}`);
    ini = prev = n;
  }
  grupos.push(ini === prev ? `${ini}` : `${ini}–${prev}`);
  return grupos.join(', ');
}
