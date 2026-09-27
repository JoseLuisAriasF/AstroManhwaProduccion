/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GÉNEROS: un nombre por idioma, una sola página por género
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada fuente escribe el género a su manera: MangaDex «Action», otra scan
 * «action», MangaUpdates «Martial Arts», otra «martial_arts», olympus «Artes
 * marciales». En la ficha española salían etiquetas en inglés y había
 * /categoria/action/, /categoria/martial-arts/ y /categoria/artes-marciales/
 * repartiéndose las mismas obras.
 *
 * Aquí se canonizan: la etiqueta española da el slug (/categoria/accion/), la
 * inglesa se usa en /en/, y cualquier alias conocido cae en el mismo género.
 * Un género que no está en la tabla se queda tal cual: mejor una etiqueta rara
 * que perderla.
 *
 * Módulo puro: lo usan el build, `indexacion.ts` y el middleware (301 de los
 * slugs viejos).
 */

interface Genero {
  es: string;
  en: string;
  alias?: string[];
}

const GENEROS: Genero[] = [
  { es: 'Acción', en: 'Action' },
  { es: 'Aventura', en: 'Adventure' },
  { es: 'Fantasía', en: 'Fantasy' },
  { es: 'Drama', en: 'Drama' },
  { es: 'Comedia', en: 'Comedy' },
  { es: 'Romance', en: 'Romance' },
  { es: 'Artes marciales', en: 'Martial Arts' },
  { es: 'Sobrenatural', en: 'Supernatural' },
  { es: 'Recuentos de la vida', en: 'Slice of Life' },
  { es: 'Vida escolar', en: 'School Life' },
  { es: 'Ciencia ficción', en: 'Sci-Fi', alias: ['sci fi', 'scifi', 'science fiction'] },
  { es: 'Misterio', en: 'Mystery' },
  { es: 'Psicológico', en: 'Psychological' },
  { es: 'Terror', en: 'Horror' },
  { es: 'Suspenso', en: 'Thriller', alias: ['suspense'] },
  { es: 'Histórico', en: 'Historical' },
  { es: 'Tragedia', en: 'Tragedy' },
  { es: 'Deportes', en: 'Sports' },
  { es: 'Mecha', en: 'Mecha' },
  { es: 'Música', en: 'Music' },
  { es: 'Crimen', en: 'Crime' },
  { es: 'Medicina', en: 'Medical' },
  { es: 'Superhéroes', en: 'Superhero' },
  { es: 'Filosófico', en: 'Philosophical' },
  { es: 'Videojuegos', en: 'Game', alias: ['games', 'video games'] },
  { es: 'Chicas mágicas', en: 'Magical Girls', alias: ['mahou shoujo'] },
  { es: 'Cambio de género', en: 'Gender Bender' },
  { es: 'Isekai', en: 'Isekai', alias: ['transported to another world', 'another world', 'otro mundo'] },
  { es: 'Harem', en: 'Harem' },
  { es: 'Ecchi', en: 'Ecchi' },
  { es: 'Seinen', en: 'Seinen' },
  { es: 'Shounen', en: 'Shounen' },
  { es: 'Shoujo', en: 'Shoujo' },
  { es: 'Josei', en: 'Josei' },
  { es: 'Wuxia', en: 'Wuxia' },
  { es: 'Murim', en: 'Murim' },
  { es: 'Regresión', en: 'Regression', alias: ['regressor', 'returner', 'regresion'] },
  { es: 'Reencarnación', en: 'Reincarnation', alias: ['reincarnated', 'rebirth', 'renacimiento'] },
  { es: 'Viaje en el tiempo', en: 'Time Travel', alias: ['time manipulation'] },
  { es: 'Magia', en: 'Magic', alias: ['magic school', 'mages'] },
  { es: 'Cultivo', en: 'Cultivation', alias: ['xianxia', 'xuanhuan'] },
  { es: 'Sistema', en: 'System', alias: ['game system', 'status window', 'game elements'] },
  { es: 'Mazmorras', en: 'Dungeon', alias: ['dungeons'] },
  { es: 'Supervivencia', en: 'Survival' },
  { es: 'Postapocalíptico', en: 'Post-Apocalyptic', alias: ['apocalypse', 'apocalyptic', 'post apocalyptic'] },
  { es: 'Monstruos', en: 'Monsters', alias: ['monster', 'monster girls'] },
  { es: 'Villana', en: 'Villainess' },
  { es: 'Nobleza', en: 'Nobility', alias: ['aristocracy', 'royalty', 'realeza'] },
  { es: 'Academia', en: 'Academy' },
  { es: 'Militar', en: 'Military' },
  { es: 'Cocina', en: 'Cooking', alias: ['gourmet'] },
  { es: 'Vampiros', en: 'Vampire', alias: ['vampires'] },
  { es: 'Zombis', en: 'Zombie', alias: ['zombies'] },
  { es: 'Protagonista OP', en: 'Overpowered MC', alias: ['op mc', 'overpowered protagonist', 'overpowered main character'] },
  { es: 'Venganza', en: 'Revenge' },
  { es: 'Torres', en: 'Tower' },
  { es: 'Demonios', en: 'Demons', alias: ['demon'] },
  { es: 'Protagonista genio', en: 'Genius MC' },
  { es: 'Protagonista loco', en: 'Crazy MC' },
  { es: 'Premiado', en: 'Award Winning' },
  { es: 'Maduro', en: 'Mature' },
  { es: 'Adulto', en: 'Adult' },
  { es: 'Hentai', en: 'Hentai' },
  { es: 'Smut', en: 'Smut' },
  { es: 'Erótico', en: 'Erotica', alias: ['erotico', 'pornographic'] },
  { es: 'Yaoi', en: 'Yaoi' },
  { es: 'Yuri', en: 'Yuri' },
  { es: "Boys' Love", en: "Boys' Love", alias: ['bl'] },
  { es: "Girls' Love", en: "Girls' Love", alias: ['gl'] },
  { es: 'Shounen Ai', en: 'Shounen Ai' },
  { es: 'Shoujo Ai', en: 'Shoujo Ai' },
  { es: 'Lolicon', en: 'Lolicon' },
  { es: 'Shotacon', en: 'Shotacon' },
];

/** «Martial_Arts», «martial arts», «Artes Marciales» → «martial arts» / «artes marciales». */
const normal = (c: string) =>
  c
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** El slug de URL de una etiqueta: el de siempre (categorias.ts lo reutiliza). */
export const slugDe = (c: string) =>
  c
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const INDICE = new Map<string, Genero>();
for (const g of GENEROS) {
  for (const n of [g.es, g.en, ...(g.alias ?? [])]) INDICE.set(normal(n), g);
}

const buscar = (c: string) => INDICE.get(normal(c));

/** El género en el idioma pedido (es por defecto), o la etiqueta tal cual si no se conoce. */
export function nombreGenero(c: string, idioma: string = 'es'): string {
  const g = buscar(c);
  return g ? (idioma === 'es' ? g.es : g.en) : c.trim();
}

/** Una clave estable para comparar géneros sin importar idioma ni grafía. */
export const claveGenero = (c: string) => slugDe(buscar(c)?.es ?? c);

/** Las etiquetas de una obra en un idioma, sin repetidos («Action» + «action» = una). */
export function generosEn(categorias: string[], idioma: string = 'es'): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const c of categorias) {
    if (!c?.trim()) continue;
    const clave = claveGenero(c);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(nombreGenero(c, idioma));
  }
  return salida;
}

/** ¿Está en la tabla? Filtra los tags de AniList/MangaUpdates/MAL, que son
 *  cientos («Male Protagonist», «Full Color»…): solo entran los que son género. */
export const esGeneroConocido = (c: string) => buscar(c) !== undefined;

/**
 * Une los géneros de varias fuentes (scans, AniList, MangaUpdates, MAL…) sin
 * repetir: «Action», «Acción» y «action» son uno. Gana la primera grafía, así
 * que lo que la obra ya tenía va primero. `tope` evita fichas con 30 etiquetas.
 */
export function fusionarGeneros(listas: (string[] | null | undefined)[], tope = 15): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const c of listas.flat()) {
    if (!c?.trim()) continue;
    const clave = claveGenero(c);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(c.trim());
  }
  return salida.slice(0, tope);
}

/**
 * El slug canónico de un slug de categoría viejo, o null si ya lo es o no se
 * conoce: /categoria/action/ → «accion», /categoria/martial-arts/ → «artes-marciales».
 */
export function slugGeneroCanonico(slug: string): string | null {
  const g = buscar(slug);
  if (!g) return null;
  const bueno = slugDe(g.es);
  return bueno === slug ? null : bueno;
}
