import type { Capitulo, EquivalenciaManhwa, Novela } from '@/types/novela';

export const novelas: Novela[] = [
  {
    id: 'n1',
    slug: 'el-regreso-del-espadachin-solitario',
    titulo: 'El Regreso del Espadachín Solitario',
    titulosAlternativos: [
      'The Return of the Lonely Swordsman',
      'O Retorno do Espadachim Solitário',
      'Godok-han Geomgaek-ui Gwihwan',
      'TRLS',
    ],
    sinopsis:
      'Tras morir a manos del Rey Demonio, Kang Ye-jin despierta veinte años en el pasado con la memoria intacta y una espada que aún no ha aprendido a odiarlo. Esta vez no piensa proteger a un reino que lo traicionó: piensa quedarse con él.',
    portadaUrl: '/portadas/espadachin.svg',
    estado: 'En emisión',
    categorias: ['Regresión', 'Artes marciales', 'Fantasía oscura'],
  },
  {
    id: 'n2',
    slug: 'la-alquimista-del-imperio-caido',
    titulo: 'La Alquimista del Imperio Caído',
    titulosAlternativos: [
      'The Alchemist of the Fallen Empire',
      'A Alquimista do Império Caído',
      'Mullak-han Jeguk-ui Geumsulsa',
      'TAFE',
    ],
    sinopsis:
      'Elise Vandermore fue ejecutada por envenenar al emperador. Vuelve a abrir los ojos tres años antes del juicio, con el mismo laboratorio, los mismos enemigos y, por primera vez, la receta exacta del veneno.',
    portadaUrl: '/portadas/alquimista.svg',
    estado: 'En emisión',
    categorias: ['Romance', 'Villana', 'Política'],
  },
  {
    id: 'n3',
    slug: 'nivel-maximo-desde-el-primer-dia',
    titulo: 'Nivel Máximo Desde el Primer Día',
    titulosAlternativos: [
      'Max Level From Day One',
      'Nível Máximo Desde o Primeiro Dia',
      'Cheotnal-buteo Manrebel',
      'MLFDO',
    ],
    sinopsis:
      'El sistema le asignó a Jun-ho la clase más inútil del despertar: Portero. Diez años después es el único humano que puede cerrar una puerta que el mundo entero necesita mantener cerrada.',
    portadaUrl: '/portadas/nivel-maximo.svg',
    estado: 'Finalizado',
    categorias: ['Sistema', 'Cazadores', 'Acción'],
  },
  {
    id: 'n4',
    slug: 'el-duque-que-no-queria-ser-amado',
    titulo: 'El Duque Que No Quería Ser Amado',
    titulosAlternativos: [
      'The Duke Who Refused to Be Loved',
      'O Duque Que Não Queria Ser Amado',
      'Sarang-badgo Sipji Anh-eun Gonjak',
    ],
    sinopsis:
      'Un contrato matrimonial de dos años, una cláusula de divorcio impecable y un duque convencido de que el afecto es una debilidad contable. Ninguno de los dos leyó la letra pequeña.',
    portadaUrl: '/portadas/duque.svg',
    estado: 'En emisión',
    categorias: ['Romance', 'Histórico', 'Slow burn'],
  },
];

/** Mapa de anclas manhwa -> novela. Entre anclas se interpola linealmente. */
export const equivalencias: Record<string, EquivalenciaManhwa[]> = {
  'el-regreso-del-espadachin-solitario': [
    { capituloManhwa: 1, capituloNovela: 1 },
    { capituloManhwa: 20, capituloNovela: 28 },
    { capituloManhwa: 50, capituloNovela: 72 },
    { capituloManhwa: 86, capituloNovela: 123 },
    { capituloManhwa: 110, capituloNovela: 160 },
  ],
  'la-alquimista-del-imperio-caido': [
    { capituloManhwa: 1, capituloNovela: 1 },
    { capituloManhwa: 30, capituloNovela: 39 },
    { capituloManhwa: 64, capituloNovela: 88 },
  ],
  'nivel-maximo-desde-el-primer-dia': [
    { capituloManhwa: 1, capituloNovela: 1 },
    { capituloManhwa: 45, capituloNovela: 70 },
    { capituloManhwa: 120, capituloNovela: 201 },
  ],
  'el-duque-que-no-queria-ser-amado': [
    { capituloManhwa: 1, capituloNovela: 1 },
    { capituloManhwa: 25, capituloNovela: 31 },
  ],
};

/**
 * Texto de ejemplo. En producción sale de la tabla `capitulos` de Supabase,
 * en UN solo idioma: las demás versiones las produce el caché de traducción.
 */
const PARRAFOS_ES = [
  'El pasillo olía a piedra mojada y a hierro viejo. Conté los pasos hasta la puerta —doce, siempre doce— y me detuve antes de tocarla, porque en la otra vida esa puerta me había costado un brazo.',
  'No era miedo. El miedo se agota; esto era memoria, que es peor, porque la memoria sabe exactamente dónde duele y tiene todo el tiempo del mundo para recordártelo.',
  '—Llegas tarde —dijo ella sin levantar la vista del pergamino—. Otra vez.\n\n—Llegué justo a tiempo —respondí—. Solo que a otra cosa.',
  'Afuera, la nieve caía sobre el patio con esa lentitud administrativa de las cosas que no tienen prisa por terminar. Adentro, la vela llevaba dos horas muriéndose y todavía le quedaba media noche por delante.',
  'Hay una diferencia entre saber el futuro y poder cambiarlo, y esa diferencia se mide en cadáveres. Yo había aprendido a contarlos antes de aprender a evitarlos.',
  'Levanté la mano. El sello respondió al primer intento —cosa que no había ocurrido en veinte años de la vida anterior— y por un segundo, solo uno, me permití pensar que quizá esta vez sí.',
];

function contenido(numero: number): string {
  const n = 5 + (numero % 4);
  return Array.from({ length: n }, (_, i) => PARRAFOS_ES[(numero + i) % PARRAFOS_ES.length]).join(
    '\n\n',
  );
}

const TOTALES: Record<string, number> = {
  'el-regreso-del-espadachin-solitario': 160,
  'la-alquimista-del-imperio-caido': 88,
  'nivel-maximo-desde-el-primer-dia': 201,
  'el-duque-que-no-queria-ser-amado': 31,
};

/** Genera capítulos mock deterministas. Reemplazable por una query a Supabase. */
export function capitulosDe(slug: string): Capitulo[] {
  const total = TOTALES[slug] ?? 0;
  const anclas = equivalencias[slug] ?? [];
  return Array.from({ length: total }, (_, i) => {
    const numero = i + 1;
    const ancla = anclas.find((e) => e.capituloNovela === numero);
    return {
      id: `${slug}-${numero}`,
      novelaSlug: slug,
      numero,
      titulo: `Capítulo ${numero}`,
      contenidoTexto: contenido(numero),
      fechaPublicacion: new Date(Date.UTC(2024, 0, 1 + numero * 2)).toISOString(),
      equivalenciaManhwa: ancla?.capituloManhwa,
    };
  });
}
