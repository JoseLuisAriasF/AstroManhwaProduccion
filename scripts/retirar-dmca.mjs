// Añade un slug a la lista de obras retiradas (src/lib/dmca.ts). Lo llama el
// workflow .github/workflows/dmca-retirar.yml con la URL o el slug del informe.
//
//   node scripts/retirar-dmca.mjs "https://www.manhwatonovel.com/novela/pasion/"
//   node scripts/retirar-dmca.mjs pasion
//   node scripts/retirar-dmca.mjs --test   (comprobación)
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = new URL('../src/lib/dmca.ts', import.meta.url);

/** Saca el slug de una URL /novela/<slug>/, de una ruta o del slug pelado. */
export function extraerSlug(objetivo) {
  const limpio = String(objetivo).trim().split(/[?#]/)[0].replace(/\/+$/, '');
  const enNovela = limpio.match(/\/novela\/([^/]+)/);
  const bruto = enNovela ? enNovela[1] : limpio.split('/').pop();
  return decodeURIComponent(bruto ?? '').trim();
}

function retirar(objetivo) {
  const slug = extraerSlug(objetivo);
  if (!slug) throw new Error(`no pude sacar un slug de: ${objetivo}`);

  const src = readFileSync(RUTA, 'utf8');
  if (new RegExp(`(['"])${slug}\\1`).test(src)) {
    console.log(`'${slug}' ya estaba retirada. Nada que hacer.`);
    return false;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const linea = `  '${slug}', // retirada DMCA — ${hoy}\n`;
  // Se inserta justo antes del cierre del Set: `]);`.
  const nuevo = src.replace(/(\n)(\]\);)/, `$1${linea}$2`);
  if (nuevo === src) throw new Error('no encontré el cierre `]);` de RETIRADAS en dmca.ts');
  writeFileSync(RUTA, nuevo);
  console.log(`Retirada '${slug}'.`);
  return true;
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
  const cambio = retirar(objetivo);
  process.exit(cambio ? 0 : 0);
}
