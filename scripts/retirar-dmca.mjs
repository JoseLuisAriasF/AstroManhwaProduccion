// Añade un slug a la lista de obras retiradas (src/lib/dmca.ts). Lo llama el
// workflow .github/workflows/dmca-retirar.yml con la URL o el slug del informe.
//
//   node scripts/retirar-dmca.mjs "https://www.manhwatonovel.com/novela/pasion/"
//   node scripts/retirar-dmca.mjs pasion
//   node scripts/retirar-dmca.mjs --test   (comprobación)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const RUTA = new URL('../src/lib/dmca.ts', import.meta.url);
const RUTA_TRAFICO = new URL('../src/lib/con-trafico.json', import.meta.url);

/** Saca el slug de una URL /novela/<slug>/, de una ruta o del slug pelado. */
export function extraerSlug(objetivo) {
  const limpio = String(objetivo).trim().split(/[?#]/)[0].replace(/\/+$/, '');
  const enNovela = limpio.match(/\/novela\/([^/]+)/);
  const bruto = enNovela ? enNovela[1] : limpio.split('/').pop();
  return decodeURIComponent(bruto ?? '').trim().toLowerCase();
}

async function purgarSupabase(slug) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    await Promise.all([
      db.from('obras').delete().eq('slug', slug),
      db.from('capitulos_externos').delete().eq('obra_slug', slug),
      db.from('fuentes').delete().eq('obra_slug', slug),
      db.from('equivalencias').delete().eq('novela_slug', slug),
    ]);
    console.log(`[dmca] '${slug}' purgada de Supabase.`);
  } catch (e) {
    console.warn(`[dmca] aviso al purgar de Supabase: ${e.message}`);
  }
}

async function retirar(objetivo) {
  const slug = extraerSlug(objetivo);
  if (!slug) throw new Error(`no pude sacar un slug de: ${objetivo}`);

  const src = readFileSync(RUTA, 'utf8');
  let cambio = false;
  if (!new RegExp(`(['"])${slug}\\1`).test(src)) {
    const hoy = new Date().toISOString().slice(0, 10);
    const linea = `  '${slug}', // retirada DMCA — ${hoy}\n`;
    const nuevo = src.replace(/(\n)(\]\);)/, `$1${linea}$2`);
    if (nuevo === src) throw new Error('no encontré el cierre `]);` de RETIRADAS en dmca.ts');
    writeFileSync(RUTA, nuevo);
    console.log(`Retirada '${slug}' en dmca.ts.`);
    cambio = true;
  } else {
    console.log(`'${slug}' ya estaba en dmca.ts.`);
  }

  if (existsSync(RUTA_TRAFICO)) {
    try {
      const trafico = JSON.parse(readFileSync(RUTA_TRAFICO, 'utf8'));
      if (Array.isArray(trafico) && trafico.includes(slug)) {
        const nuevoTrafico = trafico.filter((s) => s !== slug);
        writeFileSync(RUTA_TRAFICO, JSON.stringify(nuevoTrafico, null, 2) + '\n');
        console.log(`'${slug}' quitada de con-trafico.json.`);
        cambio = true;
      }
    } catch {}
  }

  await purgarSupabase(slug);

  if (process.env.CF_DEPLOY_HOOK) {
    try {
      await fetch(process.env.CF_DEPLOY_HOOK, { method: 'POST' });
      console.log(`[dmca] despliegue en Cloudflare activado.`);
    } catch (e) {
      console.warn(`[dmca] error al llamar CF_DEPLOY_HOOK: ${e.message}`);
    }
  }

  return cambio;
}

if (process.argv[2] === '--test') {
  const casos = [
    ['https://www.manhwatonovel.com/novela/pasion/', 'pasion'],
    ['https://www.manhwatonovel.com/novela/pasion/capitulo-5', 'pasion'],
    ['/novela/mi-obra/', 'mi-obra'],
    ['mi-obra', 'mi-obra'],
    ['https://x.com/novela/con%20espacio/', 'con espacio'],
  ];
  for (const [entrada, esperado] of casos) {
    const got = extraerSlug(entrada);
    if (got !== esperado) throw new Error(`extraerSlug(${entrada}) = '${got}', esperaba '${esperado}'`);
  }
  console.log('ok');
} else if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('retirar-dmca.mjs')) {
  const objetivo = process.argv[2];
  if (!objetivo) {
    console.error('Uso: node scripts/retirar-dmca.mjs <url-o-slug>');
    process.exit(1);
  }
  const cambio = await retirar(objetivo);
  process.exit(cambio ? 0 : 0);
}
