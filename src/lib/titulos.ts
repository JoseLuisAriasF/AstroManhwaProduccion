/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ NOMBRE ES EL INGLÉS (y cuál el español)
 * ─────────────────────────────────────────────────────────────────────────────
 * El <title> y el <h1> llevaban `titulosAlternativos[0]` como «nombre en
 * inglés», y ese primero es el que trajo la fuente: medido en las obras A,
 * «¡Por favor, dejen de convocarme!» salía como «Bie Zai Zhaohuan Wo La!»
 * (pinyin) con «Stop Summoning Me!» enterrado en la lista, y otras con el
 * nombre coreano romanizado («Jeoldae Hoegwi»). Nadie busca eso.
 *
 * No hay un campo «idioma» por título en la BD, así que se deduce del texto:
 * palabras vacías de cada idioma, letras que solo existen en uno y una prueba
 * para las romanizaciones de chino y coreano, que son ASCII y engañan a todo
 * lo demás. Ante la duda, NO es inglés: poner el nombre equivocado en el
 * <title> es peor que no poner segundo nombre.
 *
 * Módulo puro: lo usan el build y la función del edge.
 */

export type IdiomaTitulo = 'es' | 'en' | 'otro';

const PALABRAS_EN = new Set(
  'the of an and to in is my i me you your who with from for on at as how after into since have has was were be been becomes become only not no this that his her its it their our we he she by up out all one day when what why can will just'.split(' '),
);
const PALABRAS_ES = new Set(
  'el la los las de del en con mi mis un una y que por para al se su sus tu no es soy como cuando sin sobre entre hasta desde yo me te nos lo ya ser hacia'.split(' '),
);
/** Letras de francés, portugués, alemán, vietnamita, polaco, turco…: descartan. */
const OTRO_LATINO = /[çãõàèìòùâêîôûëïüöäßøåæœąęłńśźżđơưşğıạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]|ów\b|nh/i;
const PALABRAS_OTRO = new Set('le les des du et une aux um uma em ao do nao der die das und ein eine von zu dos ga wa wo'.split(' '));
/** Una sílaba de pinyin, sin tonos. */
const PINYIN = /^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ang|eng|ing|ong|ian|iao|uai|uan|ai|ei|ao|ou|an|en|in|un|ia|ie|iu|ua|uo|ui|ue|er|a|o|e|i|u|v))+$/;
/** Muchas palabras inglesas y españolas cortas son pinyin válido («Nano Machine»,
 *  «Papá paladin»): la palabra cuenta como china solo si es corta o lleva letras
 *  que el pinyin usa y el inglés casi no (zh, x, q). */
const esPinyin = (p: string) => PINYIN.test(p) && (p.length <= 4 || /zh|x|q/.test(p));
/** Grupos que la romanización coreana usa y el inglés casi nunca. */
const COREANO = /eo|eu|jj|kk|hw|gw|oe/;
/** Terminaciones: español (-o, -a, -ción, -dad, -mente) frente a inglés. */
const FIN_ES = /(?:o|a|os|as|cion|dad|mente)$/;
const FIN_EN = /(?:ing|ings|ed|ness|ly|tion|th|ght|er|ers|or|ist|ian|ine|ure)$/;
/** Francés que se cuela entre los alternos («Issu de sang vulgaire»). */
const FIN_FR = /(?:aire|aite|eux|eur|oir|ais|ait|ille|ee)$/;

/** El «hangul filler» (U+3164) y los espacios de ancho cero que algunas scans pegan al título. */
const INVISIBLES = /[\u3164\u200b-\u200d\ufeff]/g;
const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function idiomaTitulo(titulo: string): IdiomaTitulo {
  const t = titulo.replace(INVISIBLES, '').trim();
  if (!t || /[^\u0000-\u024f\u2000-\u206f]/.test(t)) return 'otro'; // hangul, CJK, tailandés, cirílico…
  if (OTRO_LATINO.test(t) || /\b[ld]'[a-zé]/i.test(t)) return 'otro';
  const palabras = normal(t).match(/[a-z]+/g) ?? [];
  if (!palabras.length) return 'otro';
  // Antes que las palabras vacías: «Bie Zai Zhaohuan Wo La!» tiene un «la».
  if (palabras.length >= 2 && palabras.every(esPinyin)) return 'otro';
  const en = palabras.filter((p) => PALABRAS_EN.has(p)).length;
  const es = palabras.filter((p) => PALABRAS_ES.has(p)).length;
  const otro = palabras.filter((p) => PALABRAS_OTRO.has(p)).length;
  // Portugués y francés comparten tildes y alguna palabra con el español.
  if (otro > es && otro >= en) return 'otro';
  // Solo «é», sin palabra española: francés («Le Bébé Tyran», «Évolution Infinie»).
  if (/[ñ¿¡áíóú]/i.test(t)) return 'es';
  if (/é/i.test(t)) return es && !palabras.some((p) => p.length >= 4 && (FIN_FR.test(p) || p.endsWith('ssion'))) ? 'es' : 'otro';
  const largas = palabras.filter((p) => p.length >= 4);
  if (largas.some((p) => FIN_FR.test(p)) && !largas.some((p) => FIN_EN.test(p))) return 'otro';
  if (es > en) return 'es';
  if (en > es) return 'en';
  // Sin desempate por palabras vacías: terminaciones y romanizaciones.
  if (palabras.some((p) => COREANO.test(p))) return 'otro';
  const finEs = largas.filter((p) => FIN_ES.test(p)).length;
  const finEn = largas.filter((p) => FIN_EN.test(p)).length;
  if (finEs > finEn) return 'es';
  // «Taejonbirok», «Madojeonsaenggi»: una sola palabra larga con «ae».
  if (palabras.length <= 2 && palabras.some((p) => /ae(?!l)/.test(p)) && !finEn) return 'otro';
  return 'en';
}

/** «Amigo de la Infancia del Zenith Novela»: la misma obra con la etiqueta del
 *  formato pegada. Es ruido de las scans, nunca el nombre bueno. */
const CON_FORMATO = /\s(novela|novel|manhwa|manga|webtoon)$/i;

interface ConTitulos {
  titulo: string;
  titulosAlternativos: string[];
}

const candidatos = (o: ConTitulos) =>
  [o.titulo, ...o.titulosAlternativos].filter((t, i, a) => t && !CON_FORMATO.test(t.trim()) && a.indexOf(t) === i);

/** El nombre en inglés, o undefined si no hay ninguno fiable. */
export function tituloIngles(o: ConTitulos): string | undefined {
  return candidatos(o).find((t) => idiomaTitulo(t) === 'en');
}

/** El nombre en español, o undefined. */
export function tituloEspanol(o: ConTitulos): string | undefined {
  return candidatos(o).find((t) => idiomaTitulo(t) === 'es');
}

/**
 * El nombre que va AL LADO del principal en <title>, <h1> y tarjetas.
 *   es: principal español → el inglés; principal inglés → el español, si hay.
 *   en: el principal ya es el inglés (ver api.ts) → el español, si hay.
 * Nunca repite el principal.
 */
export function segundoNombre(o: ConTitulos, idioma: string): string | undefined {
  const otro =
    idioma === 'es' && idiomaTitulo(o.titulo) !== 'en' ? tituloIngles(o) : tituloEspanol(o) ?? tituloIngles(o);
  return otro && normal(otro) !== normal(o.titulo) ? otro : undefined;
}
