/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FUSIONAR: dos fichas que son la MISMA obra → una sola
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuando el emparejado automático no las unió (títulos traducidos distintos, sin
 * clave común), se unen aquí. Esto mueve TODO de `src` a `dst` y borra `src`,
 * dejando una sola ficha con el manhwa y la novela juntos.
 *
 *   node --env-file-if-exists=.env scripts/fusionar.mjs --dst=slug-a --src=slug-b --seco
 *   node --env-file-if-exists=.env scripts/fusionar.mjs --dst=slug-a --src=slug-b
 *
 * `dst` es la que se queda: su slug y su título mandan, porque el slug es la URL
 * que Google ya tiene indexada. Del resto de campos gana **el que esté relleno**:
 * si `dst` no tiene sinopsis, portada o categorías y `src` sí, se copian. Los
 * títulos de `src` pasan a alternativos, así que si vuelve a aparecer por
 * cualquiera de sus nombres, emparejará sola. Manhwa + novela = tipo 'ambos'.
 *
 * `sugerir-fusiones.mjs --aplicar` llama a `fusionar()` para hacerlo en lote.
 */
import { createClient } from '@supabase/supabase-js';

/** Unión de tipos: manhwa + novela = ambos; igual + igual = igual. */
export function tipoFusion(a, b) {
  if (a === 'ambos' || b === 'ambos') return 'ambos';
  return a === b ? a : 'ambos';
}

/**
 * Lo que gana la ficha que se queda. Campo por campo: el suyo si lo tiene
 * relleno, el de la otra si no. Es "lo mejor de cada una" sin inventarse nada:
 * nunca pisa un dato bueno con otro, solo rellena huecos.
 */
export function mejorDe(dst, src) {
  const alts = [
    ...new Set(
      [...(dst.titulos_alternativos ?? []), src.titulo, ...(src.titulos_alternativos ?? [])].filter(
        (t) => t && t !== dst.titulo,
      ),
    ),
  ];
  return {
    tipo: tipoFusion(dst.tipo, src.tipo),
    titulos_alternativos: alts,
    sinopsis: dst.sinopsis || src.sinopsis || '',
    portada_url: dst.portada_url || src.portada_url || '',
    categorias: dst.categorias?.length ? dst.categorias : (src.categorias ?? []),
    // 'Finalizado' es un dato que alguien puso; 'En emisión' es el default.
    estado: dst.estado === 'Finalizado' || src.estado === 'Finalizado' ? 'Finalizado' : dst.estado,
    // Si cualquiera de las dos estaba publicada, la fusión lo está.
    publicada: dst.publicada || src.publicada,
  };
}

/**
 * Mueve fuentes, capítulos y equivalencias de `src` a `dst`, funde los campos y
 * borra `src`. Devuelve el resumen de lo movido.
 */
export async function fusionar(db, dst, src, { seco = false } = {}) {
  if (!dst || !src || dst === src) throw new Error('dst y src tienen que ser dos slugs distintos');
  const { data: obras, error } = await db.from('obras').select('*').in('slug', [dst, src]);
  if (error) throw new Error(error.message);
  const oDst = obras.find((o) => o.slug === dst);
  const oSrc = obras.find((o) => o.slug === src);
  if (!oDst || !oSrc) throw new Error(`no existe: ${!oDst ? dst : src}`);

  const campos = mejorDe(oDst, oSrc);
  const { count: nFuentes } = await db
    .from('fuentes')
    .select('id', { count: 'exact', head: true })
    .eq('obra_slug', src);
  const { count: nCaps } = await db
    .from('capitulos_externos')
    .select('id', { count: 'exact', head: true })
    .eq('obra_slug', src);
  const resumen = { dst, src, fuentes: nFuentes ?? 0, capitulos: nCaps ?? 0, ...campos };
  if (seco) return resumen;

  // Reasignar antes de borrar (FKs por obra_slug texto, no por id).
  for (const t of ['fuentes', 'capitulos_externos', 'equivalencias']) {
    const col = t === 'equivalencias' ? 'novela_slug' : 'obra_slug';
    const r = await db.from(t).update({ [col]: dst }).eq(col, src);
    if (r.error) throw new Error(`${t}: ${r.error.message}`);
  }
  const r1 = await db.from('obras').update(campos).eq('slug', dst);
  if (r1.error) throw new Error(`obras dst: ${r1.error.message}`);
  const r2 = await db.from('obras').delete().eq('slug', src);
  if (r2.error) throw new Error(`borrar src: ${r2.error.message}`);
  return resumen;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (import.meta.main) {
  // self-check de la unión de tipos y del relleno de huecos
  console.assert(tipoFusion('manhwa', 'novela') === 'ambos', 'manhwa+novela=ambos');
  console.assert(tipoFusion('manhwa', 'manhwa') === 'manhwa', 'igual se conserva');
  console.assert(tipoFusion('ambos', 'novela') === 'ambos', 'ambos absorbe');

  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
  const seco = process.argv.includes('--seco');
  const dst = arg('dst');
  const src = arg('src');
  if (!dst || !src || dst === src) {
    console.error('Uso: --dst=<slug que se queda> --src=<slug que se absorbe>');
    process.exit(1);
  }

  const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const r = await fusionar(db, dst, src, { seco });
  console.log(`FUSIÓN  ${src}  →  ${dst}`);
  console.log(`  fuentes: ${r.fuentes} · capítulos: ${r.capitulos} · tipo: ${r.tipo}`);
  console.log(`  alternativos resultantes: ${r.titulos_alternativos.length}`);
  console.log(seco ? '[seco] nada escrito' : 'listo. Recuerda rebuild (git push / deploy hook).');
}
