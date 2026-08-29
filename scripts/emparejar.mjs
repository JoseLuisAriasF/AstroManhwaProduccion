/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EMPAREJAR: la misma obra desde varias fuentes → una sola entrada
 * ─────────────────────────────────────────────────────────────────────────────
 * "Regreso de la Secta del Monte Hua" en Leemiau y "Return of the Mount Hua
 * Sect" en MangaDex son la MISMA obra. Sin esto serían dos fichas distintas y
 * el lector no vería junto el manhwa en español y la novela en inglés.
 *
 * La clave: cada obra guarda su título y sus títulos alternativos (MangaDex los
 * trae en varios idiomas). Se indexan TODOS normalizados; una serie nueva casa
 * si cualquiera de SUS nombres coincide con cualquiera de los de una obra ya
 * conocida. Así un nombre coreano en una fuente engancha con el inglés de otra.
 *
 * Es deliberadamente conservador: casa por igualdad de nombre normalizado, no
 * por parecido difuso. Un falso positivo funde dos obras distintas y es feo de
 * deshacer; un falso negativo solo deja una ficha duplicada que el admin une a
 * mano. Se prefiere lo segundo.
 */

/** Minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // cualquier no-alfanumérico (incluye CJK como letra)
    .trim()
    .replace(/\s+/g, ' ')
    // NFD descompone el hangul en jamos; NFC lo recompone al carácter original.
    // Sin esto, "화산귀환" saldría como jamos sueltos: casa igual pero es feo.
    .normalize('NFC');
}

// Artículos iniciales que una fuente pone y otra no: "El Regreso ..." vs
// "Regreso ...". Se indexa también la versión sin ellos para que emparejen.
const ARTICULO = /^(el|la|los|las|un|una|the|a|an)\s+/;

// Sufijo de tipo que algunas scans pegan al título: anslid publica "Cállate
// Dragona … Novela" y el blog la misma obra sin ese "Novela". Se indexa también
// la versión sin el sufijo para que el manhwa y la novela caigan en una ficha.
const TIPO_SUFIJO = /\s+(novela|manhwa|novel|manga|manhua|comic|webtoon)$/;

/**
 * Las claves con las que una obra entra y se busca: con/sin artículo, sin
 * sufijo de tipo y con las palabras ORDENADAS.
 *
 * Lo de ordenar las palabras es lo que salva las traducciones hechas por manos
 * distintas: Olympus publica "El Lancero Genio Inmortal" y MangaBaka guarda
 * "El genio lancero inmortal" — mismas palabras, otro orden. Sin esta clave no
 * casaban y la obra quedaba partida en dos fichas (el manhwa en español por un
 * lado, la novela en inglés por otro). Sigue siendo conservador: exige EL MISMO
 * conjunto de palabras, no un parecido difuso.
 */
export function clavesDe(nombre) {
  const claves = new Set();
  for (const v of [normalizar(nombre), normalizar(nombre).replace(TIPO_SUFIJO, '')]) {
    for (const c of [v, v.replace(ARTICULO, '')]) {
      claves.add(c);
      // Solo desde 3 palabras: con 2 ("Rey Demonio"/"Demonio Rey") el orden
      // distingue obras de verdad y ordenarlas fundiría cosas distintas.
      const palabras = c.split(' ');
      if (palabras.length >= 3) claves.add(palabras.sort().join(' '));
    }
  }
  return [...claves].filter(Boolean);
}

/**
 * Índice de nombre-normalizado → slug. Un slug entra con todos sus nombres
 * (título + alternativos); una búsqueda prueba todos los nombres de la serie.
 */
export class IndiceObras {
  #porNombre = new Map();

  /** Registra una obra con todos sus nombres. El primer slug en un nombre gana. */
  registrar(slug, nombres) {
    for (const n of nombres) {
      for (const clave of clavesDe(n)) {
        // Nombres muy cortos ("god", "re") generan choques absurdos. Fuera.
        if (clave.length < 3) continue;
        if (!this.#porNombre.has(clave)) this.#porNombre.set(clave, slug);
      }
    }
  }

  /** El slug de la obra que comparte algún nombre con esta serie, o null. */
  buscar(nombres) {
    for (const n of nombres) {
      for (const clave of clavesDe(n)) {
        const slug = this.#porNombre.get(clave);
        if (slug) return slug;
      }
    }
    return null;
  }
}
