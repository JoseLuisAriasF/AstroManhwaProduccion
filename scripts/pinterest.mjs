/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PINTEREST: el catálogo convertido en pines, sin pagar una herramienta
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinterest es el único canal donde una publicación sigue trayendo visitas
 * meses después, y este nicho se busca POR PORTADA. El sitio ya tiene las dos
 * piezas que hacen falta y no hay que crear nada:
 *
 *  - la portada servida desde nuestro dominio (`/portada/<slug>.jpg`), que ya
 *    viene en proporción 2:3 — exactamente el formato que Pinterest quiere;
 *  - la brecha manhwa↔novela, que es un titular y no un adjetivo.
 *
 * Pinterest Business trae "creación masiva": se sube un CSV y publica hasta
 * 200 pines por archivo, programados en el futuro. Es gratis y no necesita ni
 * su API (que pide aprobación de app) ni un programador de pago tipo Tailwind.
 * Este script escribe ese CSV.
 *
 *   node --env-file-if-exists=.env scripts/pinterest.mjs --seco
 *   node ... scripts/pinterest.mjs                       # 1 archivo, 200 pines
 *   node ... scripts/pinterest.mjs --lotes=3 --por-dia=10
 *
 * Lleva un registro en `pinterest/enviados.txt`: la corrida siguiente empieza
 * donde acabó la anterior en vez de repetir las mismas 200 obras. Ese archivo
 * es el estado entero — borrarlo vuelve a empezar desde el principio.
 *
 * Publicar de golpe 200 pines el mismo día es la forma más rápida de que la
 * cuenta se marque como spam. Por eso `--por-dia` reparte las fechas: 10 al
 * día, a horas distintas, es el ritmo que aguanta una cuenta nueva.
 *
 * Necesita SITE_URL y las credenciales de Supabase (la anon key basta: lee).
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const l = a.replace(/^--/, '');
    const i = l.indexOf('=');
    return i === -1 ? [l, 'true'] : [l.slice(0, i), l.slice(i + 1)];
  }),
);

const sitio = (process.env.SITE_URL || '').replace(/\/$/, '');
if (!sitio) {
  console.error('Falta SITE_URL (p.ej. https://www.manhwatonovel.com)');
  process.exit(1);
}
const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const DIR = 'pinterest';
const REGISTRO = `${DIR}/enviados.txt`;
const POR_ARCHIVO = 200; // tope de Pinterest por subida
const lotes = Math.max(1, Number(args.lotes) || 1);
const porDia = Math.max(1, Number(args['por-dia']) || 10);
const seco = args.seco === 'true';

/**
 * Un tablero por género grande, no uno por cada género que devuelva AniList:
 * Pinterest reparte alcance por tablero y treinta tableros con cuatro pines no
 * los lee nadie. Lo que no cae en la lista va al tablero por defecto, que es
 * además el que describe al sitio entero.
 */
const POR_DEFECTO = 'Manhwa con novela';
const TABLEROS = {
  action: 'Manhwa de acción',
  acción: 'Manhwa de acción',
  adventure: 'Manhwa de aventura',
  aventura: 'Manhwa de aventura',
  fantasy: 'Manhwa de fantasía',
  fantasía: 'Manhwa de fantasía',
  romance: 'Manhwa romántico',
  drama: 'Manhwa romántico',
  'martial arts': 'Manhwa de artes marciales',
  'artes marciales': 'Manhwa de artes marciales',
  murim: 'Manhwa de artes marciales',
  cultivation: 'Manhwa de cultivo',
  cultivo: 'Manhwa de cultivo',
  xianxia: 'Manhwa de cultivo',
  isekai: 'Manhwa de regresión e isekai',
  regresión: 'Manhwa de regresión e isekai',
  regression: 'Manhwa de regresión e isekai',
  reencarnación: 'Manhwa de regresión e isekai',
  villainess: 'Manhwa de villanas',
  villana: 'Manhwa de villanas',
  horror: 'Manhwa de terror',
  terror: 'Manhwa de terror',
};
const tableroDe = (categorias) => {
  for (const c of categorias) {
    const t = TABLEROS[String(c).toLowerCase().trim()];
    if (t) return t;
  }
  return POR_DEFECTO;
};

/** Comillas dobles y saltos de línea: lo mínimo para que un título con "," no
 *  corra una columna el resto de la fila. */
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s*\n\s*/g, ' ')}"`;
const corta = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const miles = (n) => n.toLocaleString('es-ES');

/** `orden` no es opcional de verdad: sin un ORDER BY que desempate TODAS las
 *  filas, `range()` se salta unas y repite otras. Medido en
 *  `capitulos_externos`: sin orden se pierde el 36 % de la tabla. */
async function todas(tabla, columnas, filtrar = (q) => q, orden = 'id') {
  const TAM = 1000;
  const filas = [];
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await filtrar(db.from(tabla).select(columnas))
      .order(orden)
      .range(desde, desde + TAM - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < TAM) break;
  }
  return filas;
}

// ── Datos ────────────────────────────────────────────────────────────────────
// Los mismos tres orígenes que usa el sitio, y la brecha con la MISMA regla
// (máximo `numero` por tipo): un pin que promete 1.775 capítulos y una ficha que
// enseña otra cifra quema la visita que costó traer.
console.log('Leyendo catálogo…');
const [obras, fuentes, caps] = await Promise.all([
  todas('obras', 'slug, titulo, titulos_alternativos, tipo, categorias, portada_url', (q) =>
    q.eq('publicada', true), 'slug',
  ),
  todas('fuentes', 'obra_slug, portada_vista'),
  todas('capitulos_externos', 'obra_slug, tipo, numero', (q) => q.eq('aprobado', true)),
]);

const conPortada = new Set(fuentes.filter((f) => f.portada_vista).map((f) => f.obra_slug));
const maximos = new Map(); // slug -> { manhwa, novela }
for (const c of caps) {
  if (typeof c.numero !== 'number') continue;
  const m = maximos.get(c.obra_slug) ?? { manhwa: 0, novela: 0 };
  if (c.numero > m[c.tipo]) m[c.tipo] = c.numero;
  maximos.set(c.obra_slug, m);
}

mkdirSync(DIR, { recursive: true });
const enviados = new Set(
  existsSync(REGISTRO) ? readFileSync(REGISTRO, 'utf8').split('\n').filter(Boolean) : [],
);

// Primero las obras con brecha grande: son las que tienen titular propio y la
// página de equivalencia a la que apuntar. Después, las demás por capítulos
// indexados. Una obra sin portada no se pinea: Pinterest es una imagen.
const candidatas = obras
  .filter((o) => !enviados.has(o.slug))
  .filter((o) => conPortada.has(o.slug) || /^https?:\/\//.test(o.portada_url || ''))
  .map((o) => {
    const m = maximos.get(o.slug) ?? { manhwa: 0, novela: 0 };
    const faltan = m.manhwa && m.novela ? Math.max(0, m.novela - m.manhwa) : 0;
    return { ...o, ...m, faltan, total: Math.max(m.manhwa, m.novela) };
  })
  .filter((o) => o.total > 0)
  .sort((a, b) => b.faltan - a.faltan || b.total - a.total);

const elegidas = candidatas.slice(0, lotes * POR_ARCHIVO);
if (!elegidas.length) {
  console.log(`Nada nuevo que pinear (${enviados.size} obras ya en ${REGISTRO}).`);
  process.exit(0);
}

// ── Un pin ───────────────────────────────────────────────────────────────────
// La búsqueda de Pinterest es texto: el título y la descripción son lo único
// por lo que un pin aparece. Por eso van dentro los títulos alternativos —el
// lector brasileño busca el título en portugués— y el género, y no hashtags,
// que Pinterest dejó de usar para buscar.
function pin(o, cuando) {
  const alternos = (o.titulos_alternativos ?? []).filter((t) => t && t !== o.titulo).slice(0, 3);
  const titulo = o.faltan
    ? corta(`${o.titulo}: la novela va ${miles(o.faltan)} capítulos por delante del manhwa`, 100)
    : corta(`${o.titulo} — dónde leer todos los capítulos en español`, 100);
  const cuerpo = o.faltan
    ? `El manhwa va por el capítulo ${miles(o.manhwa)} y la novela por el ${miles(o.novela)}: te faltan ${miles(o.faltan)} capítulos de historia. Te decimos por qué capítulo seguir y dónde leerla, gratis.`
    : `Todas las fuentes de ${o.titulo} indexadas en un sitio: ${miles(o.total)} capítulos con enlace al sitio original, y el aviso cuando sale uno nuevo.`;
  const descripcion = corta(
    [cuerpo, alternos.length ? `También conocida como ${alternos.join(', ')}.` : '']
      .filter(Boolean)
      .join(' '),
    500,
  );
  // A la página de equivalencia solo cuando existe (obras con los dos formatos
  // y numeración): es la que responde la promesa del titular. Enviar un pin a
  // una URL que devuelve 404 es tráfico tirado y una señal mala para el dominio.
  const destino = o.faltan ? `${sitio}/novela/${o.slug}/equivalencia` : `${sitio}/novela/${o.slug}`;
  return [
    titulo,
    `${sitio}/portada/${o.slug}.jpg`,
    tableroDe(o.categorias ?? []),
    '', // Thumbnail: solo para vídeo
    descripcion,
    destino,
    cuando,
    [...(o.categorias ?? []).slice(0, 3), 'manhwa', 'novela ligera', 'dónde leer'].join(', '),
  ];
}

// Fechas: a partir de mañana, `porDia` pines repartidos entre las 09:00 y las
// 21:00 UTC. Fuera de esa franja el pin nace de madrugada y pierde el primer
// empujón, que es el que decide si Pinterest lo distribuye.
const cuandoDe = (i) => {
  const dia = Math.floor(i / porDia);
  const hora = 9 + Math.round(((i % porDia) * 12) / porDia);
  const d = new Date(Date.now() + 86400_000 * (dia + 1));
  return `${d.toISOString().slice(0, 10)}T${String(hora).padStart(2, '0')}:00:00`;
};

const CABECERA = [
  'Title',
  'Media URL',
  'Pinterest board',
  'Thumbnail',
  'Description',
  'Link',
  'Publish date',
  'Keywords',
];

const tableros = new Map();
const hoy = new Date().toISOString().slice(0, 10);
const archivos = [];
for (let l = 0; l * POR_ARCHIVO < elegidas.length; l++) {
  const trozo = elegidas.slice(l * POR_ARCHIVO, (l + 1) * POR_ARCHIVO);
  const filas = trozo.map((o, i) => pin(o, cuandoDe(l * POR_ARCHIVO + i)));
  for (const f of filas) tableros.set(f[2], (tableros.get(f[2]) ?? 0) + 1);
  const nombre = `${DIR}/pines-${hoy}-${l + 1}.csv`;
  archivos.push(nombre);
  if (!seco) {
    writeFileSync(nombre, [CABECERA, ...filas].map((f) => f.map(csv).join(',')).join('\n') + '\n');
  }
}

console.log(
  `${elegidas.length} pines en ${archivos.length} archivo(s) · quedan ${candidatas.length - elegidas.length} obras sin pinear`,
);
for (const [t, n] of [...tableros].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(4)}  ${t}`);
console.log('\nEjemplo:');
console.log(pin(elegidas[0], cuandoDe(0)).slice(0, 3).join('\n  '));

if (seco) {
  console.log('\n(--seco: no se escribió nada)');
  process.exit(0);
}
writeFileSync(REGISTRO, [...enviados, ...elegidas.map((o) => o.slug)].join('\n') + '\n');
console.log(`\n${archivos.join('\n')}`);
console.log(`Registro: ${REGISTRO} (${enviados.size + elegidas.length} obras)`);
console.log(
  '\nCrea esos tableros en Pinterest y sube cada CSV en\n' +
    '  Pinterest Business → Crear → Creación masiva (hasta 200 por archivo).',
);
