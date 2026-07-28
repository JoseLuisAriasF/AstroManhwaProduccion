/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IDIOMAS DEL SITIO
 * ─────────────────────────────────────────────────────────────────────────────
 * Dos capas, a propósito:
 *
 * 1) IDIOMAS (abajo) = idiomas con URL propia e indexables: /en/…, /pt/…
 *    Añadir uno es añadir una entrada aquí + su diccionario en UI. Todas las
 *    rutas, el hreflang, el sitemap y el selector se generan solos. N idiomas,
 *    no tres: el número sale de este objeto.
 *
 * 2) Cualquier otro idioma = lo traduce el propio navegador. Chrome, Safari y
 *    Edge lo ofrecen solos cuando <html lang> no coincide con el idioma del
 *    usuario. Cero scripts, cero páginas, mejor calidad que un widget.
 *
 * Lo que la capa 2 NO da es SEO: esa traducción ocurre después de que Googlebot
 * indexó la página, así que no rankeas en ese idioma. El tráfico en otros
 * idiomas lo traen los `titulosAlternativos` en texto visible.
 *
 * Regla para mover un idioma de (2) a (1): tener el texto realmente traducido.
 * Publicar 480 capítulos auto-traducidos en /fr/ no posiciona, se considera
 * contenido duplicado de baja calidad. El hreflang solo vale si el contenido existe.
 */

export const IDIOMA_BASE = 'es';

/**
 * Ordenados por valor real para este nicho = volumen de búsqueda × CPM.
 *
 *   en  volumen altísimo + CPM más alto. El idioma que paga las facturas.
 *   pt  Brasil es de los mayores fandoms de manhwa del mundo. CPM medio.
 *   es  base del sitio: LatAm + España, volumen alto, CPM medio-bajo.
 *   id  Indonesia lidera lectura de webtoon/manhwa. CPM bajo, volumen brutal.
 *   fr  mejor equilibrio de Europa: CPM alto y cultura de scanlation fuerte.
 *   de  el CPM más alto de la lista. Público menor pero muy rentable.
 *   vi  volumen enorme en novela ligera. CPM bajo, tráfico barato de captar.
 *
 * Fuera a propósito, y por qué:
 *   ru  AdSense no monetiza tráfico ruso desde 2022. Volumen sí, dinero no.
 *   ar  requiere revisar el layout en RTL antes de publicarlo (dir ya existe).
 *   ko/ja  son el idioma de la obra original: ese lector no busca traducción.
 */
export const IDIOMAS = {
  es: { nombre: 'Español', htmlLang: 'es', ogLocale: 'es_ES', dir: 'ltr' },
  en: { nombre: 'English', htmlLang: 'en', ogLocale: 'en_US', dir: 'ltr' },
  pt: { nombre: 'Português', htmlLang: 'pt-BR', ogLocale: 'pt_BR', dir: 'ltr' },
  id: { nombre: 'Bahasa Indonesia', htmlLang: 'id', ogLocale: 'id_ID', dir: 'ltr' },
  fr: { nombre: 'Français', htmlLang: 'fr', ogLocale: 'fr_FR', dir: 'ltr' },
  de: { nombre: 'Deutsch', htmlLang: 'de', ogLocale: 'de_DE', dir: 'ltr' },
  vi: { nombre: 'Tiếng Việt', htmlLang: 'vi', ogLocale: 'vi_VN', dir: 'ltr' },
} as const;

export type Idioma = keyof typeof IDIOMAS;

export const CODIGOS = Object.keys(IDIOMAS) as Idioma[];

export function esIdioma(x: unknown): x is Idioma {
  return typeof x === 'string' && x in IDIOMAS;
}

/** El idioma de la URL actual. `undefined` en las rutas del idioma base. */
export function idiomaDe(param: string | undefined): Idioma {
  return esIdioma(param) ? param : IDIOMA_BASE;
}

/** Prefija una ruta con el idioma. El idioma base va sin prefijo. */
export function ruta(idioma: Idioma, camino = '/'): string {
  const limpio = camino.startsWith('/') ? camino : `/${camino}`;
  return idioma === IDIOMA_BASE ? limpio : `/${idioma}${limpio}`;
}

/** Idioma a partir del pathname: /en/novela/x -> 'en', /novela/x -> 'es'. */
export function idiomaDeRuta(pathname: string): Idioma {
  return idiomaDe(pathname.split('/')[1]);
}

/** Quita el prefijo de idioma: /pt/novela/x -> /novela/x */
export function rutaCanonica(pathname: string): string {
  const [, primero, ...resto] = pathname.split('/');
  return esIdioma(primero) ? `/${resto.join('/')}` : pathname;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diccionarios. `es` es la referencia: TypeScript obliga a que el resto la cubra.
// ─────────────────────────────────────────────────────────────────────────────

const es = {
  sitioDescripcion:
    'Novelas ligeras adaptadas de manhwa, completas y gratis. Te decimos el capítulo exacto de la novela donde se quedó el manhwa.',

  // Navegación
  navNovelas: 'Novelas',
  navBiblioteca: 'Mi biblioteca',
  navInicio: 'Inicio',
  navSitemap: 'Mapa del sitio',
  navCatalogo: 'Catálogo',
  saltarContenido: 'Saltar al contenido',
  piePie: 'Novelas ligeras adaptadas de manhwa.',

  // Tema
  tema: 'Tema',
  temaClaro: 'Claro',
  temaOscuro: 'Oscuro',
  temaSistema: 'Sistema',

  // Sesión
  entrarConGoogle: 'Entrar con Google',
  cuenta: 'Cuenta',
  cerrarSesion: 'Cerrar sesión',
  authSinConfigurar: 'Configura PUBLIC_SUPABASE_URL para habilitar la sincronización',

  // Idioma
  cambiarIdioma: 'Cambiar idioma',
  traducir: 'Traducir',
  noGracias: 'No, gracias',

  // Banner de sincronización
  bannerTexto: 'Guardamos tu progreso automáticamente',
  bannerEnEsteDispositivo: 'en este dispositivo',
  bannerResto:
    '. Inicia sesión con Google para sincronizar tus capítulos leídos y tu lista de novelas guardadas entre tu celular y tu computadora.',
  bannerSincronizar: 'Sincronizar con Google',
  bannerInvitado: 'Seguir como invitado',

  // Portada
  heroBadge: 'Manhwa → Novela',
  heroTitulo: 'Sigue la historia donde el manhwa se detuvo',
  heroSub:
    'Te decimos el capítulo exacto de la novela que corresponde al último capítulo del manhwa que leíste. Sin releer, sin spoilers, sin adivinar.',
  buscarPlaceholder: 'Busca por título en cualquier idioma…',
  buscarEtiqueta: 'Buscar novelas',
  statNovelas: 'novelas',
  statCapitulos: 'capítulos',
  statGratis: 'gratis',
  continuarLeyendo: 'Continuar leyendo',
  tendencias: 'Tendencias',
  tendenciasSub: 'lo que más se está leyendo',
  ultimosCapitulos: 'Últimos capítulos',
  catalogo: 'Catálogo',
  resultados: (n: number) => `Resultados (${n})`,
  sinResultados: 'No encontramos novelas con ese nombre.',
  todas: 'Todas',

  // Ficha de novela
  enEmision: 'En emisión',
  finalizado: 'Finalizado',
  capitulosCorto: 'caps.',
  nCapitulos: (n: number) => `${n} capítulos`,
  tambienConocida: 'También conocida como:',
  empezarALeer: 'Empezar a leer',
  continuarEnCap: (n: number) => `Continuar en el cap. ${n}`,
  guardar: 'Guardar',
  guardada: 'Guardada',
  capitulos: 'Capítulos',
  filtroCapitulo: 'Nº de capítulo',
  filtrarCapitulos: 'Filtrar capítulos',
  marcarLeidoAria: (n: number) => `Marcar capítulo ${n} como leído`,
  manhwaCorto: 'manhwa',

  // Puente manhwa → novela
  puenteTitulo: '¿Vienes del manhwa?',
  puenteSub:
    'Dinos en qué capítulo del manhwa te quedaste y te llevamos al punto exacto de la novela.',
  puenteEtiqueta: 'Manhwa cap.',
  puenteAria: 'Capítulo del manhwa donde te quedaste',
  puenteBoton: 'Continuar en la novela',
  puenteResultado: (manhwa: number, novela: number) =>
    `Si te quedaste en el <strong>capítulo ${manhwa} del manhwa</strong>, empieza a leer desde el <strong class="text-acento-500">capítulo ${novela} de la novela</strong>.`,
  puenteAproximado: '(equivalencia aproximada)',

  // Lectora
  capitulo: (n: number) => `Capítulo ${n}`,
  equivaleA: (n: number) => `Equivale al <strong class="text-acento-500">cap. ${n} del manhwa</strong>`,
  marcarLeido: 'Marcar leído',
  leido: 'Leído',
  reducirTexto: 'Reducir texto',
  aumentarTexto: 'Aumentar texto',
  capAnterior: (n: number) => `← Capítulo ${n}`,
  capSiguiente: (n: number) => `Capítulo ${n} →`,
  finPublicado: 'Fin de lo publicado',
  navCapitulos: 'Navegación de capítulos',
  tambienPublicada: 'también publicada como',
  capituloDe: (n: number) => `Capítulo ${n} de`,

  // Biblioteca
  bibliotecaTitulo: 'Mi biblioteca',
  bibliotecaSub: 'Novelas guardadas y capítulos que ya leíste.',
  bibliotecaVacia: 'Aún no guardaste ninguna novela.',
  bibliotecaExplora: 'Explora el catálogo →',
  deNCapitulos: (leidos: number, total: number) => `${leidos} de ${total} capítulos`,
  empezar: 'Empezar',
  vasPorCap: (n: number) => `Vas por el cap. ${n}`,
  continuarEnCapitulo: (n: number) => `Continuar en el capítulo ${n}`,

  // SEO
  seoInicio: 'Lee la novela donde dejaste el manhwa',
  seoNovelaTitulo: (titulo: string, alterno: string) =>
    `${titulo} (${alterno}) — Novela completa en español`,
  seoNovelaDesc: (titulo: string, alternos: string, n: number) =>
    `Lee ${titulo} — también conocida como ${alternos} — completa y en español. ${n} capítulos y la equivalencia exacta con el manhwa.`,
  seoCapituloTitulo: (titulo: string, n: number, alterno: string) =>
    `${titulo} Capítulo ${n} — ${alterno} Chapter ${n}`,
  seoCapituloDesc: (titulo: string, n: number, alternos: string, extracto: string) =>
    `Lee el capítulo ${n} de ${titulo} (${alternos}) online y en español. ${extracto}…`,
  seoCatalogoDesc: 'Todas las novelas ligeras adaptadas de manhwa, con su equivalencia de capítulos.',
  seoBibliotecaDesc: 'Tus novelas guardadas y tu progreso de lectura, sincronizados entre dispositivos.',
};

export type Diccionario = typeof es;

const en: Diccionario = {
  sitioDescripcion:
    'Light novels adapted from manhwa, complete and free. We tell you the exact novel chapter where the manhwa left off.',

  navNovelas: 'Novels',
  navBiblioteca: 'My library',
  navInicio: 'Home',
  navSitemap: 'Sitemap',
  navCatalogo: 'Catalog',
  saltarContenido: 'Skip to content',
  piePie: 'Light novels adapted from manhwa.',

  tema: 'Theme',
  temaClaro: 'Light',
  temaOscuro: 'Dark',
  temaSistema: 'System',

  entrarConGoogle: 'Sign in with Google',
  cuenta: 'Account',
  cerrarSesion: 'Sign out',
  authSinConfigurar: 'Set PUBLIC_SUPABASE_URL to enable syncing',

  cambiarIdioma: 'Change language',
  traducir: 'Translate',
  noGracias: 'No thanks',

  bannerTexto: 'We save your progress automatically',
  bannerEnEsteDispositivo: 'on this device',
  bannerResto:
    '. Sign in with Google to sync your read chapters and your saved novels between your phone and your computer.',
  bannerSincronizar: 'Sync with Google',
  bannerInvitado: 'Continue as guest',

  heroBadge: 'Manhwa → Novel',
  heroTitulo: 'Pick the story up where the manhwa stopped',
  heroSub:
    'We tell you the exact novel chapter matching the last manhwa chapter you read. No re-reading, no spoilers, no guessing.',
  buscarPlaceholder: 'Search by title in any language…',
  buscarEtiqueta: 'Search novels',
  statNovelas: 'novels',
  statCapitulos: 'chapters',
  statGratis: 'free',
  continuarLeyendo: 'Keep reading',
  tendencias: 'Trending',
  tendenciasSub: 'what people are reading most',
  ultimosCapitulos: 'Latest chapters',
  catalogo: 'Catalog',
  resultados: (n: number) => `Results (${n})`,
  sinResultados: 'No novels found with that name.',
  todas: 'All',

  enEmision: 'Ongoing',
  finalizado: 'Completed',
  capitulosCorto: 'ch.',
  nCapitulos: (n: number) => `${n} chapters`,
  tambienConocida: 'Also known as:',
  empezarALeer: 'Start reading',
  continuarEnCap: (n: number) => `Continue at ch. ${n}`,
  guardar: 'Save',
  guardada: 'Saved',
  capitulos: 'Chapters',
  filtroCapitulo: 'Chapter no.',
  filtrarCapitulos: 'Filter chapters',
  marcarLeidoAria: (n: number) => `Mark chapter ${n} as read`,
  manhwaCorto: 'manhwa',

  puenteTitulo: 'Coming from the manhwa?',
  puenteSub: 'Tell us which manhwa chapter you stopped at and we take you to the exact spot in the novel.',
  puenteEtiqueta: 'Manhwa ch.',
  puenteAria: 'Manhwa chapter you stopped at',
  puenteBoton: 'Continue in the novel',
  puenteResultado: (manhwa: number, novela: number) =>
    `If you stopped at <strong>manhwa chapter ${manhwa}</strong>, start reading from <strong class="text-acento-500">novel chapter ${novela}</strong>.`,
  puenteAproximado: '(approximate match)',

  capitulo: (n: number) => `Chapter ${n}`,
  equivaleA: (n: number) => `Matches <strong class="text-acento-500">manhwa ch. ${n}</strong>`,
  marcarLeido: 'Mark as read',
  leido: 'Read',
  reducirTexto: 'Decrease text size',
  aumentarTexto: 'Increase text size',
  capAnterior: (n: number) => `← Chapter ${n}`,
  capSiguiente: (n: number) => `Chapter ${n} →`,
  finPublicado: 'End of what is published',
  navCapitulos: 'Chapter navigation',
  tambienPublicada: 'also published as',
  capituloDe: (n: number) => `Chapter ${n} of`,

  bibliotecaTitulo: 'My library',
  bibliotecaSub: 'Saved novels and chapters you have already read.',
  bibliotecaVacia: 'You have not saved any novel yet.',
  bibliotecaExplora: 'Browse the catalog →',
  deNCapitulos: (leidos: number, total: number) => `${leidos} of ${total} chapters`,
  empezar: 'Start',
  vasPorCap: (n: number) => `You are on ch. ${n}`,
  continuarEnCapitulo: (n: number) => `Continue at chapter ${n}`,

  seoInicio: 'Read the novel where the manhwa left off',
  seoNovelaTitulo: (titulo: string, alterno: string) => `${titulo} (${alterno}) — Full novel online`,
  seoNovelaDesc: (titulo: string, alternos: string, n: number) =>
    `Read ${titulo} — also known as ${alternos} — in full. ${n} chapters and the exact manhwa-to-novel chapter match.`,
  seoCapituloTitulo: (titulo: string, n: number, alterno: string) =>
    `${titulo} Chapter ${n} — ${alterno} Chapter ${n}`,
  seoCapituloDesc: (titulo: string, n: number, alternos: string, extracto: string) =>
    `Read chapter ${n} of ${titulo} (${alternos}) online. ${extracto}…`,
  seoCatalogoDesc: 'Every light novel adapted from manhwa, with its chapter equivalence.',
  seoBibliotecaDesc: 'Your saved novels and reading progress, synced across devices.',
};

const pt: Diccionario = {
  sitioDescripcion:
    'Novels leves adaptadas de manhwa, completas e grátis. Dizemos o capítulo exato da novel onde o manhwa parou.',

  navNovelas: 'Novels',
  navBiblioteca: 'Minha biblioteca',
  navInicio: 'Início',
  navSitemap: 'Mapa do site',
  navCatalogo: 'Catálogo',
  saltarContenido: 'Pular para o conteúdo',
  piePie: 'Novels leves adaptadas de manhwa.',

  tema: 'Tema',
  temaClaro: 'Claro',
  temaOscuro: 'Escuro',
  temaSistema: 'Sistema',

  entrarConGoogle: 'Entrar com Google',
  cuenta: 'Conta',
  cerrarSesion: 'Sair',
  authSinConfigurar: 'Configure PUBLIC_SUPABASE_URL para habilitar a sincronização',

  cambiarIdioma: 'Mudar idioma',
  traducir: 'Traduzir',
  noGracias: 'Não, obrigado',

  bannerTexto: 'Salvamos seu progresso automaticamente',
  bannerEnEsteDispositivo: 'neste dispositivo',
  bannerResto:
    '. Entre com o Google para sincronizar seus capítulos lidos e sua lista de novels salvas entre o celular e o computador.',
  bannerSincronizar: 'Sincronizar com Google',
  bannerInvitado: 'Continuar como visitante',

  heroBadge: 'Manhwa → Novel',
  heroTitulo: 'Continue a história de onde o manhwa parou',
  heroSub:
    'Dizemos o capítulo exato da novel que corresponde ao último capítulo do manhwa que você leu. Sem reler, sem spoilers, sem adivinhar.',
  buscarPlaceholder: 'Busque pelo título em qualquer idioma…',
  buscarEtiqueta: 'Buscar novels',
  statNovelas: 'novels',
  statCapitulos: 'capítulos',
  statGratis: 'grátis',
  continuarLeyendo: 'Continuar lendo',
  tendencias: 'Em alta',
  tendenciasSub: 'o que mais estão lendo',
  ultimosCapitulos: 'Últimos capítulos',
  catalogo: 'Catálogo',
  resultados: (n: number) => `Resultados (${n})`,
  sinResultados: 'Nenhuma novel encontrada com esse nome.',
  todas: 'Todas',

  enEmision: 'Em lançamento',
  finalizado: 'Finalizada',
  capitulosCorto: 'caps.',
  nCapitulos: (n: number) => `${n} capítulos`,
  tambienConocida: 'Também conhecida como:',
  empezarALeer: 'Começar a ler',
  continuarEnCap: (n: number) => `Continuar no cap. ${n}`,
  guardar: 'Salvar',
  guardada: 'Salva',
  capitulos: 'Capítulos',
  filtroCapitulo: 'Nº do capítulo',
  filtrarCapitulos: 'Filtrar capítulos',
  marcarLeidoAria: (n: number) => `Marcar capítulo ${n} como lido`,
  manhwaCorto: 'manhwa',

  puenteTitulo: 'Veio do manhwa?',
  puenteSub: 'Diga em que capítulo do manhwa você parou e levamos você ao ponto exato da novel.',
  puenteEtiqueta: 'Manhwa cap.',
  puenteAria: 'Capítulo do manhwa onde você parou',
  puenteBoton: 'Continuar na novel',
  puenteResultado: (manhwa: number, novela: number) =>
    `Se você parou no <strong>capítulo ${manhwa} do manhwa</strong>, comece a ler a partir do <strong class="text-acento-500">capítulo ${novela} da novel</strong>.`,
  puenteAproximado: '(equivalência aproximada)',

  capitulo: (n: number) => `Capítulo ${n}`,
  equivaleA: (n: number) => `Equivale ao <strong class="text-acento-500">cap. ${n} do manhwa</strong>`,
  marcarLeido: 'Marcar como lido',
  leido: 'Lido',
  reducirTexto: 'Diminuir texto',
  aumentarTexto: 'Aumentar texto',
  capAnterior: (n: number) => `← Capítulo ${n}`,
  capSiguiente: (n: number) => `Capítulo ${n} →`,
  finPublicado: 'Fim do que foi publicado',
  navCapitulos: 'Navegação de capítulos',
  tambienPublicada: 'também publicada como',
  capituloDe: (n: number) => `Capítulo ${n} de`,

  bibliotecaTitulo: 'Minha biblioteca',
  bibliotecaSub: 'Novels salvas e capítulos que você já leu.',
  bibliotecaVacia: 'Você ainda não salvou nenhuma novel.',
  bibliotecaExplora: 'Explorar o catálogo →',
  deNCapitulos: (leidos: number, total: number) => `${leidos} de ${total} capítulos`,
  empezar: 'Começar',
  vasPorCap: (n: number) => `Você está no cap. ${n}`,
  continuarEnCapitulo: (n: number) => `Continuar no capítulo ${n}`,

  seoInicio: 'Leia a novel de onde o manhwa parou',
  seoNovelaTitulo: (titulo: string, alterno: string) => `${titulo} (${alterno}) — Novel completa`,
  seoNovelaDesc: (titulo: string, alternos: string, n: number) =>
    `Leia ${titulo} — também conhecida como ${alternos} — completa. ${n} capítulos e a equivalência exata com o manhwa.`,
  seoCapituloTitulo: (titulo: string, n: number, alterno: string) =>
    `${titulo} Capítulo ${n} — ${alterno} Chapter ${n}`,
  seoCapituloDesc: (titulo: string, n: number, alternos: string, extracto: string) =>
    `Leia o capítulo ${n} de ${titulo} (${alternos}) online. ${extracto}…`,
  seoCatalogoDesc: 'Todas as novels leves adaptadas de manhwa, com sua equivalência de capítulos.',
  seoBibliotecaDesc: 'Suas novels salvas e seu progresso de leitura, sincronizados entre dispositivos.',
};

const id: Diccionario = {
  sitioDescripcion:
    'Novel ringan adaptasi manhwa, lengkap dan gratis. Kami tunjukkan bab novel yang tepat di mana manhwa-nya berhenti.',

  navNovelas: 'Novel',
  navBiblioteca: 'Perpustakaan saya',
  navInicio: 'Beranda',
  navSitemap: 'Peta situs',
  navCatalogo: 'Katalog',
  saltarContenido: 'Lompat ke konten',
  piePie: 'Novel ringan adaptasi manhwa.',

  tema: 'Tema',
  temaClaro: 'Terang',
  temaOscuro: 'Gelap',
  temaSistema: 'Sistem',

  entrarConGoogle: 'Masuk dengan Google',
  cuenta: 'Akun',
  cerrarSesion: 'Keluar',
  authSinConfigurar: 'Atur PUBLIC_SUPABASE_URL untuk mengaktifkan sinkronisasi',

  cambiarIdioma: 'Ganti bahasa',
  traducir: 'Buka versi ini',
  noGracias: 'Tidak, terima kasih',

  bannerTexto: 'Kami menyimpan progresmu otomatis',
  bannerEnEsteDispositivo: 'di perangkat ini',
  bannerResto:
    '. Masuk dengan Google untuk menyinkronkan bab yang sudah dibaca dan daftar novel tersimpan antara ponsel dan komputermu.',
  bannerSincronizar: 'Sinkronkan dengan Google',
  bannerInvitado: 'Lanjut sebagai tamu',

  heroBadge: 'Manhwa → Novel',
  heroTitulo: 'Lanjutkan cerita dari tempat manhwa berhenti',
  heroSub:
    'Kami tunjukkan bab novel yang cocok dengan bab manhwa terakhir yang kamu baca. Tanpa mengulang, tanpa spoiler, tanpa menebak.',
  buscarPlaceholder: 'Cari judul dalam bahasa apa pun…',
  buscarEtiqueta: 'Cari novel',
  statNovelas: 'novel',
  statCapitulos: 'bab',
  statGratis: 'gratis',
  continuarLeyendo: 'Lanjut membaca',
  tendencias: 'Sedang tren',
  tendenciasSub: 'yang paling banyak dibaca',
  ultimosCapitulos: 'Bab terbaru',
  catalogo: 'Katalog',
  resultados: (n: number) => `Hasil (${n})`,
  sinResultados: 'Tidak ada novel dengan nama itu.',
  todas: 'Semua',

  enEmision: 'Berjalan',
  finalizado: 'Tamat',
  capitulosCorto: 'bab',
  nCapitulos: (n: number) => `${n} bab`,
  tambienConocida: 'Dikenal juga sebagai:',
  empezarALeer: 'Mulai membaca',
  continuarEnCap: (n: number) => `Lanjut ke bab ${n}`,
  guardar: 'Simpan',
  guardada: 'Tersimpan',
  capitulos: 'Bab',
  filtroCapitulo: 'No. bab',
  filtrarCapitulos: 'Saring bab',
  marcarLeidoAria: (n: number) => `Tandai bab ${n} sudah dibaca`,
  manhwaCorto: 'manhwa',

  puenteTitulo: 'Datang dari manhwa?',
  puenteSub:
    'Beri tahu kami bab manhwa terakhir yang kamu baca dan kami antar ke titik yang tepat di novel.',
  puenteEtiqueta: 'Bab manhwa',
  puenteAria: 'Bab manhwa terakhir yang kamu baca',
  puenteBoton: 'Lanjut di novel',
  puenteResultado: (manhwa: number, novela: number) =>
    `Kalau kamu berhenti di <strong>bab ${manhwa} manhwa</strong>, mulai baca dari <strong class="text-acento-500">bab ${novela} novel</strong>.`,
  puenteAproximado: '(perkiraan)',

  capitulo: (n: number) => `Bab ${n}`,
  equivaleA: (n: number) => `Setara <strong class="text-acento-500">bab ${n} manhwa</strong>`,
  marcarLeido: 'Tandai dibaca',
  leido: 'Sudah dibaca',
  reducirTexto: 'Perkecil teks',
  aumentarTexto: 'Perbesar teks',
  capAnterior: (n: number) => `← Bab ${n}`,
  capSiguiente: (n: number) => `Bab ${n} →`,
  finPublicado: 'Akhir dari yang sudah terbit',
  navCapitulos: 'Navigasi bab',
  tambienPublicada: 'juga terbit sebagai',
  capituloDe: (n: number) => `Bab ${n} dari`,

  bibliotecaTitulo: 'Perpustakaan saya',
  bibliotecaSub: 'Novel tersimpan dan bab yang sudah kamu baca.',
  bibliotecaVacia: 'Kamu belum menyimpan novel apa pun.',
  bibliotecaExplora: 'Jelajahi katalog →',
  deNCapitulos: (leidos: number, total: number) => `${leidos} dari ${total} bab`,
  empezar: 'Mulai',
  vasPorCap: (n: number) => `Kamu di bab ${n}`,
  continuarEnCapitulo: (n: number) => `Lanjut ke bab ${n}`,

  seoInicio: 'Baca novelnya dari tempat manhwa berhenti',
  seoNovelaTitulo: (titulo: string, alterno: string) =>
    `${titulo} (${alterno}) — Novel lengkap online`,
  seoNovelaDesc: (titulo: string, alternos: string, n: number) =>
    `Baca ${titulo} — dikenal juga sebagai ${alternos} — lengkap. ${n} bab dan padanan bab manhwa ke novel.`,
  seoCapituloTitulo: (titulo: string, n: number, alterno: string) =>
    `${titulo} Bab ${n} — ${alterno} Chapter ${n}`,
  seoCapituloDesc: (titulo: string, n: number, alternos: string, extracto: string) =>
    `Baca bab ${n} dari ${titulo} (${alternos}) online. ${extracto}…`,
  seoCatalogoDesc: 'Semua novel ringan adaptasi manhwa, lengkap dengan padanan babnya.',
  seoBibliotecaDesc: 'Novel tersimpan dan progres bacamu, tersinkron di semua perangkat.',
};

const fr: Diccionario = {
  sitioDescripcion:
    'Light novels adaptés de manhwa, complets et gratuits. Nous vous indiquons le chapitre exact du roman où le manhwa s’est arrêté.',

  navNovelas: 'Romans',
  navBiblioteca: 'Ma bibliothèque',
  navInicio: 'Accueil',
  navSitemap: 'Plan du site',
  navCatalogo: 'Catalogue',
  saltarContenido: 'Aller au contenu',
  piePie: 'Light novels adaptés de manhwa.',

  tema: 'Thème',
  temaClaro: 'Clair',
  temaOscuro: 'Sombre',
  temaSistema: 'Système',

  entrarConGoogle: 'Se connecter avec Google',
  cuenta: 'Compte',
  cerrarSesion: 'Se déconnecter',
  authSinConfigurar: 'Définissez PUBLIC_SUPABASE_URL pour activer la synchronisation',

  cambiarIdioma: 'Changer de langue',
  traducir: 'Voir cette version',
  noGracias: 'Non merci',

  bannerTexto: 'Nous enregistrons votre progression automatiquement',
  bannerEnEsteDispositivo: 'sur cet appareil',
  bannerResto:
    '. Connectez-vous avec Google pour synchroniser vos chapitres lus et vos romans enregistrés entre votre téléphone et votre ordinateur.',
  bannerSincronizar: 'Synchroniser avec Google',
  bannerInvitado: 'Continuer en invité',

  heroBadge: 'Manhwa → Roman',
  heroTitulo: 'Reprenez l’histoire là où le manhwa s’est arrêté',
  heroSub:
    'Nous vous indiquons le chapitre du roman qui correspond au dernier chapitre du manhwa que vous avez lu. Sans relire, sans spoilers, sans deviner.',
  buscarPlaceholder: 'Chercher un titre dans n’importe quelle langue…',
  buscarEtiqueta: 'Chercher des romans',
  statNovelas: 'romans',
  statCapitulos: 'chapitres',
  statGratis: 'gratuit',
  continuarLeyendo: 'Continuer la lecture',
  tendencias: 'Tendances',
  tendenciasSub: 'ce qui se lit le plus',
  ultimosCapitulos: 'Derniers chapitres',
  catalogo: 'Catalogue',
  resultados: (n: number) => `Résultats (${n})`,
  sinResultados: 'Aucun roman trouvé sous ce nom.',
  todas: 'Tous',

  enEmision: 'En cours',
  finalizado: 'Terminé',
  capitulosCorto: 'ch.',
  nCapitulos: (n: number) => `${n} chapitres`,
  tambienConocida: 'Aussi connu sous le nom de :',
  empezarALeer: 'Commencer la lecture',
  continuarEnCap: (n: number) => `Reprendre au ch. ${n}`,
  guardar: 'Enregistrer',
  guardada: 'Enregistré',
  capitulos: 'Chapitres',
  filtroCapitulo: 'N° de chapitre',
  filtrarCapitulos: 'Filtrer les chapitres',
  marcarLeidoAria: (n: number) => `Marquer le chapitre ${n} comme lu`,
  manhwaCorto: 'manhwa',

  puenteTitulo: 'Vous venez du manhwa ?',
  puenteSub:
    'Dites-nous à quel chapitre du manhwa vous vous êtes arrêté et nous vous emmenons au point exact du roman.',
  puenteEtiqueta: 'Manhwa ch.',
  puenteAria: 'Chapitre du manhwa où vous vous êtes arrêté',
  puenteBoton: 'Continuer dans le roman',
  puenteResultado: (manhwa: number, novela: number) =>
    `Si vous vous êtes arrêté au <strong>chapitre ${manhwa} du manhwa</strong>, reprenez au <strong class="text-acento-500">chapitre ${novela} du roman</strong>.`,
  puenteAproximado: '(correspondance approximative)',

  capitulo: (n: number) => `Chapitre ${n}`,
  equivaleA: (n: number) =>
    `Correspond au <strong class="text-acento-500">ch. ${n} du manhwa</strong>`,
  marcarLeido: 'Marquer comme lu',
  leido: 'Lu',
  reducirTexto: 'Réduire le texte',
  aumentarTexto: 'Agrandir le texte',
  capAnterior: (n: number) => `← Chapitre ${n}`,
  capSiguiente: (n: number) => `Chapitre ${n} →`,
  finPublicado: 'Fin de ce qui est publié',
  navCapitulos: 'Navigation des chapitres',
  tambienPublicada: 'aussi publié sous le nom de',
  capituloDe: (n: number) => `Chapitre ${n} de`,

  bibliotecaTitulo: 'Ma bibliothèque',
  bibliotecaSub: 'Romans enregistrés et chapitres déjà lus.',
  bibliotecaVacia: 'Vous n’avez encore enregistré aucun roman.',
  bibliotecaExplora: 'Parcourir le catalogue →',
  deNCapitulos: (leidos: number, total: number) => `${leidos} sur ${total} chapitres`,
  empezar: 'Commencer',
  vasPorCap: (n: number) => `Vous en êtes au ch. ${n}`,
  continuarEnCapitulo: (n: number) => `Reprendre au chapitre ${n}`,

  seoInicio: 'Lisez le roman là où le manhwa s’est arrêté',
  seoNovelaTitulo: (titulo: string, alterno: string) =>
    `${titulo} (${alterno}) — Roman complet en ligne`,
  seoNovelaDesc: (titulo: string, alternos: string, n: number) =>
    `Lisez ${titulo} — aussi connu sous le nom de ${alternos} — en intégralité. ${n} chapitres et la correspondance exacte manhwa/roman.`,
  seoCapituloTitulo: (titulo: string, n: number, alterno: string) =>
    `${titulo} Chapitre ${n} — ${alterno} Chapter ${n}`,
  seoCapituloDesc: (titulo: string, n: number, alternos: string, extracto: string) =>
    `Lisez le chapitre ${n} de ${titulo} (${alternos}) en ligne. ${extracto}…`,
  seoCatalogoDesc: 'Tous les light novels adaptés de manhwa, avec leur correspondance de chapitres.',
  seoBibliotecaDesc:
    'Vos romans enregistrés et votre progression, synchronisés sur tous vos appareils.',
};

const de: Diccionario = {
  sitioDescripcion:
    'Light Novels nach Manhwa-Vorlage, vollständig und kostenlos. Wir nennen dir das Romankapitel, an dem der Manhwa aufgehört hat.',

  navNovelas: 'Romane',
  navBiblioteca: 'Meine Bibliothek',
  navInicio: 'Startseite',
  navSitemap: 'Sitemap',
  navCatalogo: 'Katalog',
  saltarContenido: 'Zum Inhalt springen',
  piePie: 'Light Novels nach Manhwa-Vorlage.',

  tema: 'Design',
  temaClaro: 'Hell',
  temaOscuro: 'Dunkel',
  temaSistema: 'System',

  entrarConGoogle: 'Mit Google anmelden',
  cuenta: 'Konto',
  cerrarSesion: 'Abmelden',
  authSinConfigurar: 'Setze PUBLIC_SUPABASE_URL, um die Synchronisierung zu aktivieren',

  cambiarIdioma: 'Sprache wechseln',
  traducir: 'Diese Version öffnen',
  noGracias: 'Nein, danke',

  bannerTexto: 'Wir speichern deinen Fortschritt automatisch',
  bannerEnEsteDispositivo: 'auf diesem Gerät',
  bannerResto:
    '. Melde dich mit Google an, um gelesene Kapitel und gespeicherte Romane zwischen Handy und Computer zu synchronisieren.',
  bannerSincronizar: 'Mit Google synchronisieren',
  bannerInvitado: 'Als Gast fortfahren',

  heroBadge: 'Manhwa → Roman',
  heroTitulo: 'Lies weiter, wo der Manhwa aufgehört hat',
  heroSub:
    'Wir nennen dir das Romankapitel, das dem letzten von dir gelesenen Manhwa-Kapitel entspricht. Kein Nachlesen, keine Spoiler, kein Raten.',
  buscarPlaceholder: 'Titel in beliebiger Sprache suchen…',
  buscarEtiqueta: 'Romane suchen',
  statNovelas: 'Romane',
  statCapitulos: 'Kapitel',
  statGratis: 'kostenlos',
  continuarLeyendo: 'Weiterlesen',
  tendencias: 'Im Trend',
  tendenciasSub: 'was am meisten gelesen wird',
  ultimosCapitulos: 'Neueste Kapitel',
  catalogo: 'Katalog',
  resultados: (n: number) => `Ergebnisse (${n})`,
  sinResultados: 'Keine Romane mit diesem Namen gefunden.',
  todas: 'Alle',

  enEmision: 'Laufend',
  finalizado: 'Abgeschlossen',
  capitulosCorto: 'Kap.',
  nCapitulos: (n: number) => `${n} Kapitel`,
  tambienConocida: 'Auch bekannt als:',
  empezarALeer: 'Lesen beginnen',
  continuarEnCap: (n: number) => `Weiter bei Kap. ${n}`,
  guardar: 'Speichern',
  guardada: 'Gespeichert',
  capitulos: 'Kapitel',
  filtroCapitulo: 'Kapitelnr.',
  filtrarCapitulos: 'Kapitel filtern',
  marcarLeidoAria: (n: number) => `Kapitel ${n} als gelesen markieren`,
  manhwaCorto: 'Manhwa',

  puenteTitulo: 'Kommst du vom Manhwa?',
  puenteSub:
    'Sag uns, bei welchem Manhwa-Kapitel du aufgehört hast, und wir bringen dich an die genaue Stelle im Roman.',
  puenteEtiqueta: 'Manhwa Kap.',
  puenteAria: 'Manhwa-Kapitel, bei dem du aufgehört hast',
  puenteBoton: 'Im Roman weiterlesen',
  puenteResultado: (manhwa: number, novela: number) =>
    `Wenn du bei <strong>Manhwa-Kapitel ${manhwa}</strong> aufgehört hast, lies ab <strong class="text-acento-500">Romankapitel ${novela}</strong> weiter.`,
  puenteAproximado: '(ungefähre Zuordnung)',

  capitulo: (n: number) => `Kapitel ${n}`,
  equivaleA: (n: number) =>
    `Entspricht <strong class="text-acento-500">Manhwa-Kap. ${n}</strong>`,
  marcarLeido: 'Als gelesen markieren',
  leido: 'Gelesen',
  reducirTexto: 'Text verkleinern',
  aumentarTexto: 'Text vergrößern',
  capAnterior: (n: number) => `← Kapitel ${n}`,
  capSiguiente: (n: number) => `Kapitel ${n} →`,
  finPublicado: 'Ende des Veröffentlichten',
  navCapitulos: 'Kapitelnavigation',
  tambienPublicada: 'auch veröffentlicht als',
  capituloDe: (n: number) => `Kapitel ${n} von`,

  bibliotecaTitulo: 'Meine Bibliothek',
  bibliotecaSub: 'Gespeicherte Romane und bereits gelesene Kapitel.',
  bibliotecaVacia: 'Du hast noch keinen Roman gespeichert.',
  bibliotecaExplora: 'Katalog durchstöbern →',
  deNCapitulos: (leidos: number, total: number) => `${leidos} von ${total} Kapiteln`,
  empezar: 'Starten',
  vasPorCap: (n: number) => `Du bist bei Kap. ${n}`,
  continuarEnCapitulo: (n: number) => `Weiter bei Kapitel ${n}`,

  seoInicio: 'Lies den Roman dort, wo der Manhwa aufgehört hat',
  seoNovelaTitulo: (titulo: string, alterno: string) =>
    `${titulo} (${alterno}) — Kompletter Roman online`,
  seoNovelaDesc: (titulo: string, alternos: string, n: number) =>
    `Lies ${titulo} — auch bekannt als ${alternos} — komplett. ${n} Kapitel und die genaue Zuordnung zum Manhwa.`,
  seoCapituloTitulo: (titulo: string, n: number, alterno: string) =>
    `${titulo} Kapitel ${n} — ${alterno} Chapter ${n}`,
  seoCapituloDesc: (titulo: string, n: number, alternos: string, extracto: string) =>
    `Lies Kapitel ${n} von ${titulo} (${alternos}) online. ${extracto}…`,
  seoCatalogoDesc: 'Alle Light Novels nach Manhwa-Vorlage, mit ihrer Kapitelzuordnung.',
  seoBibliotecaDesc: 'Deine gespeicherten Romane und dein Lesefortschritt, geräteübergreifend.',
};

const vi: Diccionario = {
  sitioDescripcion:
    'Light novel chuyển thể từ manhwa, đầy đủ và miễn phí. Chúng tôi chỉ cho bạn đúng chương tiểu thuyết nơi manhwa dừng lại.',

  navNovelas: 'Tiểu thuyết',
  navBiblioteca: 'Thư viện của tôi',
  navInicio: 'Trang chủ',
  navSitemap: 'Sơ đồ trang',
  navCatalogo: 'Danh mục',
  saltarContenido: 'Bỏ qua đến nội dung',
  piePie: 'Light novel chuyển thể từ manhwa.',

  tema: 'Giao diện',
  temaClaro: 'Sáng',
  temaOscuro: 'Tối',
  temaSistema: 'Hệ thống',

  entrarConGoogle: 'Đăng nhập bằng Google',
  cuenta: 'Tài khoản',
  cerrarSesion: 'Đăng xuất',
  authSinConfigurar: 'Đặt PUBLIC_SUPABASE_URL để bật đồng bộ',

  cambiarIdioma: 'Đổi ngôn ngữ',
  traducir: 'Mở bản này',
  noGracias: 'Không, cảm ơn',

  bannerTexto: 'Chúng tôi tự động lưu tiến độ của bạn',
  bannerEnEsteDispositivo: 'trên thiết bị này',
  bannerResto:
    '. Đăng nhập bằng Google để đồng bộ các chương đã đọc và danh sách tiểu thuyết đã lưu giữa điện thoại và máy tính.',
  bannerSincronizar: 'Đồng bộ với Google',
  bannerInvitado: 'Tiếp tục với tư cách khách',

  heroBadge: 'Manhwa → Tiểu thuyết',
  heroTitulo: 'Đọc tiếp từ nơi manhwa dừng lại',
  heroSub:
    'Chúng tôi chỉ ra chương tiểu thuyết tương ứng với chương manhwa cuối bạn đã đọc. Không đọc lại, không spoil, không đoán mò.',
  buscarPlaceholder: 'Tìm theo tên bằng bất kỳ ngôn ngữ nào…',
  buscarEtiqueta: 'Tìm tiểu thuyết',
  statNovelas: 'tiểu thuyết',
  statCapitulos: 'chương',
  statGratis: 'miễn phí',
  continuarLeyendo: 'Đọc tiếp',
  tendencias: 'Thịnh hành',
  tendenciasSub: 'được đọc nhiều nhất',
  ultimosCapitulos: 'Chương mới nhất',
  catalogo: 'Danh mục',
  resultados: (n: number) => `Kết quả (${n})`,
  sinResultados: 'Không tìm thấy tiểu thuyết nào với tên đó.',
  todas: 'Tất cả',

  enEmision: 'Đang ra',
  finalizado: 'Hoàn thành',
  capitulosCorto: 'ch.',
  nCapitulos: (n: number) => `${n} chương`,
  tambienConocida: 'Còn được gọi là:',
  empezarALeer: 'Bắt đầu đọc',
  continuarEnCap: (n: number) => `Đọc tiếp ch. ${n}`,
  guardar: 'Lưu',
  guardada: 'Đã lưu',
  capitulos: 'Chương',
  filtroCapitulo: 'Số chương',
  filtrarCapitulos: 'Lọc chương',
  marcarLeidoAria: (n: number) => `Đánh dấu chương ${n} đã đọc`,
  manhwaCorto: 'manhwa',

  puenteTitulo: 'Bạn đến từ manhwa?',
  puenteSub:
    'Cho chúng tôi biết bạn dừng ở chương manhwa nào, chúng tôi sẽ đưa bạn tới đúng điểm trong tiểu thuyết.',
  puenteEtiqueta: 'Manhwa ch.',
  puenteAria: 'Chương manhwa bạn đã dừng lại',
  puenteBoton: 'Đọc tiếp trong tiểu thuyết',
  puenteResultado: (manhwa: number, novela: number) =>
    `Nếu bạn dừng ở <strong>chương ${manhwa} của manhwa</strong>, hãy bắt đầu đọc từ <strong class="text-acento-500">chương ${novela} của tiểu thuyết</strong>.`,
  puenteAproximado: '(tương ứng gần đúng)',

  capitulo: (n: number) => `Chương ${n}`,
  equivaleA: (n: number) =>
    `Tương ứng <strong class="text-acento-500">ch. ${n} của manhwa</strong>`,
  marcarLeido: 'Đánh dấu đã đọc',
  leido: 'Đã đọc',
  reducirTexto: 'Thu nhỏ chữ',
  aumentarTexto: 'Phóng to chữ',
  capAnterior: (n: number) => `← Chương ${n}`,
  capSiguiente: (n: number) => `Chương ${n} →`,
  finPublicado: 'Hết phần đã đăng',
  navCapitulos: 'Điều hướng chương',
  tambienPublicada: 'cũng được đăng với tên',
  capituloDe: (n: number) => `Chương ${n} của`,

  bibliotecaTitulo: 'Thư viện của tôi',
  bibliotecaSub: 'Tiểu thuyết đã lưu và các chương bạn đã đọc.',
  bibliotecaVacia: 'Bạn chưa lưu tiểu thuyết nào.',
  bibliotecaExplora: 'Khám phá danh mục →',
  deNCapitulos: (leidos: number, total: number) => `${leidos} trên ${total} chương`,
  empezar: 'Bắt đầu',
  vasPorCap: (n: number) => `Bạn đang ở ch. ${n}`,
  continuarEnCapitulo: (n: number) => `Đọc tiếp chương ${n}`,

  seoInicio: 'Đọc tiểu thuyết từ nơi manhwa dừng lại',
  seoNovelaTitulo: (titulo: string, alterno: string) =>
    `${titulo} (${alterno}) — Tiểu thuyết đầy đủ online`,
  seoNovelaDesc: (titulo: string, alternos: string, n: number) =>
    `Đọc ${titulo} — còn gọi là ${alternos} — đầy đủ. ${n} chương và bảng đối chiếu chính xác với manhwa.`,
  seoCapituloTitulo: (titulo: string, n: number, alterno: string) =>
    `${titulo} Chương ${n} — ${alterno} Chapter ${n}`,
  seoCapituloDesc: (titulo: string, n: number, alternos: string, extracto: string) =>
    `Đọc chương ${n} của ${titulo} (${alternos}) online. ${extracto}…`,
  seoCatalogoDesc: 'Tất cả light novel chuyển thể từ manhwa, kèm bảng đối chiếu chương.',
  seoBibliotecaDesc: 'Tiểu thuyết đã lưu và tiến độ đọc của bạn, đồng bộ trên mọi thiết bị.',
};

const DICCIONARIOS: Record<Idioma, Diccionario> = { es, en, pt, id, fr, de, vi };

export function t(idioma: Idioma | string | undefined): Diccionario {
  return DICCIONARIOS[idiomaDe(idioma as string)];
}
