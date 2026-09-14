/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Los textos de la ficha y de /equivalencia que llevan DATOS, en es y en
 * ─────────────────────────────────────────────────────────────────────────────
 * El <title>, la descripción, la brecha y las preguntas frecuentes estaban
 * escritos en español dentro de las páginas y en /en/ se caían al diccionario
 * genérico («Full novel online», que además no es verdad: no alojamos la novela).
 *
 * Van aparte de i18n.ts a propósito: esos diccionarios tienen que cubrir los
 * siete idiomas declarados, y estos textos solo existen en los dos que se
 * publican (ACTIVOS). Cualquier otro idioma cae al inglés.
 */

interface Brecha {
  manhwa: number;
  novela: number;
  faltan: number;
}

export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

const es = {
  capsTitulo: (manhwa: number, novela: number) =>
    [manhwa && `manhwa cap. ${manhwa}`, novela && `novela cap. ${novela}`].filter(Boolean).join(' · '),
  descripcionBrecha: (b: Brecha) =>
    `El manhwa va por el capítulo ${b.manhwa} y la novela por el ${b.novela}: te faltan ${b.faltan} capítulos de historia. Te decimos por cuál seguir y dónde leerla.`,
  descripcionFicha: (titulo: string, formatos: string, fuentes: number) =>
    `${titulo}: ${formatos}. Dónde leerla en ${fuentes} ${fuentes === 1 ? 'fuente' : 'fuentes'}, el último capítulo de cada una y por cuál seguir.`,
  formatos: (f: string[]) => (f.length === 2 ? 'manhwa y novela' : f[0] ?? ''),
  brechaTitulo: (faltan: number) => `Te faltan ${faltan} capítulos de historia`,
  brechaSub: (b: Brecha) => `El manhwa va por el ${b.manhwa} y la novela por el ${b.novela}. Mira por cuál capítulo seguir →`,
  faqTitulo: 'Preguntas frecuentes',
  faqFicha: (titulo: string, fuentes: string[], b: Brecha | null, estado?: string): Pregunta[] => [
    ...(fuentes.length
      ? [{
          pregunta: `¿Dónde leer ${titulo}?`,
          respuesta: `Está indexada en ${fuentes.length} ${fuentes.length === 1 ? 'fuente' : 'fuentes'} (${fuentes.slice(0, 5).join(', ')}). Cada una enlaza al sitio original donde se lee gratis.`,
        }]
      : []),
    ...(b
      ? [
          {
            pregunta: `¿Cuántos capítulos tiene ${titulo}?`,
            respuesta: `El manhwa lleva ${b.manhwa} capítulos indexados y la novela ${b.novela}${b.faltan ? `, ${b.faltan} por delante del manhwa` : ''}.`,
          },
          {
            pregunta: `¿Puedo leer la novela de ${titulo} sin spoilers del manhwa?`,
            respuesta: 'Sí: empieza por el capítulo de la novela que corresponde a donde dejaste el manhwa. Lo que la novela te adelanta es lo que el manhwa aún no ha dibujado, no lo que ya leíste.',
          },
        ]
      : []),
    ...(estado
      ? [{
          pregunta: `¿${titulo} está terminada?`,
          respuesta: estado === 'Finalizado' ? `Sí, ${titulo} está finalizada.` : `No, ${titulo} sigue en emisión y recibe capítulos nuevos.`,
        }]
      : []),
  ],

  // /equivalencia
  eqTitulo: (titulo: string, b: Brecha) => `${titulo}: ¿por qué capítulo de la novela sigo? — Manhwa ${b.manhwa} → Novela ${b.novela}`,
  eqH1: (titulo: string) => `¿Por qué capítulo de la novela sigo ${titulo}?`,
  eqMiga: 'Equivalencia de capítulos',
  eqMigaCorta: 'Equivalencia',
  eqRespuesta: (titulo: string, b: Brecha) =>
    b.faltan
      ? `El manhwa de ${titulo} va por el capítulo ${b.manhwa} y la novela por el ${b.novela}: hay ${b.faltan} capítulos de historia que el manhwa todavía no ha contado.`
      : `El manhwa de ${titulo} va por el capítulo ${b.manhwa} y la novela por el ${b.novela}: el manhwa está prácticamente al día con la novela.`,
  eqUltimoManhwa: 'último del manhwa',
  eqPorDelante: 'capítulos por delante',
  eqUltimoNovela: 'último de la novela',
  eqPreguntas: (titulo: string, b: Brecha, respuesta: string): Pregunta[] => [
    { pregunta: `¿En qué capítulo de la novela continúa el manhwa de ${titulo}?`, respuesta },
    { pregunta: `¿Cuántos capítulos tiene la novela de ${titulo}?`, respuesta: `La novela lleva ${b.novela} capítulos indexados y el manhwa ${b.manhwa}.` },
    {
      pregunta: `¿Leer la novela de ${titulo} tiene spoilers del manhwa?`,
      respuesta: 'Si empiezas por el capítulo que corresponde a donde dejaste el manhwa, no. Lo que se salta el manhwa está por delante, no por detrás: la novela solo te adelanta lo que el manhwa aún no dibujó.',
    },
  ],
  eqVerDonde: (titulo: string) => `Ver dónde leer ${titulo} →`,
  eqOtras: 'Otras obras con la novela adelantada',
};

type Textos = typeof es;

const en: Textos = {
  capsTitulo: (manhwa, novela) =>
    [manhwa && `manhwa ch. ${manhwa}`, novela && `novel ch. ${novela}`].filter(Boolean).join(' · '),
  descripcionBrecha: (b) =>
    `The manhwa is at chapter ${b.manhwa} and the novel at ${b.novela}: ${b.faltan} chapters of story ahead. See which novel chapter to continue from and where to read it.`,
  descripcionFicha: (titulo, formatos, fuentes) =>
    `${titulo}: ${formatos}. Where to read it across ${fuentes} ${fuentes === 1 ? 'source' : 'sources'}, the latest chapter on each and where to continue.`,
  formatos: (f) => (f.length === 2 ? 'manhwa and novel' : f[0] === 'novela' ? 'novel' : f[0] ?? ''),
  brechaTitulo: (faltan) => `${faltan} chapters of story still ahead`,
  brechaSub: (b) => `The manhwa is at ${b.manhwa} and the novel at ${b.novela}. Find the chapter to continue from →`,
  faqTitulo: 'Frequently asked questions',
  faqFicha: (titulo, fuentes, b, estado) => [
    ...(fuentes.length
      ? [{
          pregunta: `Where can I read ${titulo}?`,
          respuesta: `It is indexed on ${fuentes.length} ${fuentes.length === 1 ? 'source' : 'sources'} (${fuentes.slice(0, 5).join(', ')}). Each one links to the original site where it is free to read.`,
        }]
      : []),
    ...(b
      ? [
          {
            pregunta: `How many chapters does ${titulo} have?`,
            respuesta: `The manhwa has ${b.manhwa} chapters indexed and the novel ${b.novela}${b.faltan ? `, ${b.faltan} ahead of the manhwa` : ''}.`,
          },
          {
            pregunta: `Can I read the ${titulo} novel without manhwa spoilers?`,
            respuesta: 'Yes: start from the novel chapter that matches where you left the manhwa. What the novel gets ahead on is what the manhwa has not drawn yet, not what you already read.',
          },
        ]
      : []),
    ...(estado
      ? [{
          pregunta: `Is ${titulo} completed?`,
          respuesta: estado === 'Finalizado' ? `Yes, ${titulo} is completed.` : `No, ${titulo} is ongoing and still gets new chapters.`,
        }]
      : []),
  ],

  eqTitulo: (titulo, b) => `${titulo}: which novel chapter does the manhwa continue from? — Manhwa ${b.manhwa} → Novel ${b.novela}`,
  eqH1: (titulo) => `Which novel chapter should I continue ${titulo} from?`,
  eqMiga: 'Chapter equivalence',
  eqMigaCorta: 'Equivalence',
  eqRespuesta: (titulo, b) =>
    b.faltan
      ? `The ${titulo} manhwa is at chapter ${b.manhwa} and the novel at ${b.novela}: ${b.faltan} chapters of story the manhwa has not told yet.`
      : `The ${titulo} manhwa is at chapter ${b.manhwa} and the novel at ${b.novela}: the manhwa has practically caught up with the novel.`,
  eqUltimoManhwa: 'latest manhwa chapter',
  eqPorDelante: 'chapters ahead',
  eqUltimoNovela: 'latest novel chapter',
  eqPreguntas: (titulo, b, respuesta) => [
    { pregunta: `Which novel chapter does the ${titulo} manhwa continue from?`, respuesta },
    { pregunta: `How many chapters does the ${titulo} novel have?`, respuesta: `The novel has ${b.novela} chapters indexed and the manhwa ${b.manhwa}.` },
    {
      pregunta: `Does reading the ${titulo} novel spoil the manhwa?`,
      respuesta: 'Not if you start from the chapter that matches where you left the manhwa. What the manhwa skips is ahead of you, not behind: the novel only gets you ahead on what the manhwa has not drawn yet.',
    },
  ],
  eqVerDonde: (titulo) => `See where to read ${titulo} →`,
  eqOtras: 'Other series with the novel further ahead',
};

export const textosObra = (idioma: string): Textos => (idioma === 'es' ? es : en);
