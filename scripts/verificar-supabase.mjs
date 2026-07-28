/**
 * npm run verificar
 *
 * Comprueba que Supabase está bien conectado, sin tocar nada ni pedirte claves.
 * Úsalo después de cada paso de la guía: te dice qué falta y dónde arreglarlo.
 *
 * Solo lee la anon key, que es pública por diseño (lo que protege los datos es
 * RLS). Ninguna clave secreta hace falta aquí ni debe estar en este repo.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const anon = process.env.PUBLIC_SUPABASE_ANON_KEY;

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const mal = (m, arreglo) => {
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
  if (arreglo) console.log(`    \x1b[2m↳ ${arreglo}\x1b[0m`);
  fallos++;
};
let fallos = 0;

console.log('\nVerificando Supabase\n');

// ── 1. Variables ─────────────────────────────────────────────────────────────
if (!url || !anon) {
  mal(
    'Faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY',
    'Copia .env.example a .env y rellénalas (Supabase → Project Settings → API)',
  );
  console.log('\nSin esas dos variables el sitio funciona igual, en modo invitado.\n');
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  mal(`PUBLIC_SUPABASE_URL no tiene la forma esperada: ${url}`, 'Debe ser https://TU-PROYECTO.supabase.co (sin barra ni ruta al final)');
} else {
  ok('Variables presentes y URL con buena forma');
}

const supabase = createClient(url, anon);

// ── 2. ¿Responde el proyecto? ────────────────────────────────────────────────
let ajustes;
try {
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: anon },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ajustes = await res.json();
  ok('El proyecto responde y la anon key es válida');
} catch (e) {
  mal(`No se pudo contactar con el proyecto (${e.message})`, 'Revisa la URL y que el proyecto no esté pausado (los gratuitos se pausan tras 1 semana sin uso)');
}

// ── 3. ¿Google OAuth activado? ───────────────────────────────────────────────
if (ajustes) {
  if (ajustes.external?.google) ok('Google OAuth activado');
  else
    mal(
      'Google OAuth NO está activado',
      'Supabase → Authentication → Sign In / Providers → Google → Enable, con el Client ID y Secret de Google Cloud',
    );
}

// ── 4. ¿Existe la tabla `progreso`? ──────────────────────────────────────────
const { error: errTabla } = await supabase.from('progreso').select('novela_slug').limit(1);

if (!errTabla) {
  ok('Tabla `progreso` accesible');
} else if (/does not exist|schema cache/i.test(errTabla.message)) {
  mal('La tabla `progreso` no existe', 'Supabase → SQL Editor → pega y ejecuta supabase/schema.sql');
} else if (/permission denied/i.test(errTabla.message)) {
  ok('Tabla `progreso` existe y RLS la protege');
} else {
  mal(`Error inesperado al leer progreso: ${errTabla.message}`);
}

// ── 5. RLS: un anónimo NO debe poder escribir ────────────────────────────────
// Es la prueba importante: sin RLS cualquiera con la anon key (que es pública)
// podría escribir en el progreso de otros.
const { error: errEscritura } = await supabase
  .from('progreso')
  .insert({ user_id: '00000000-0000-0000-0000-000000000000', novela_slug: '__prueba_rls__' });

if (errEscritura) {
  ok('RLS activo: un visitante anónimo no puede escribir');
} else {
  mal(
    'PELIGRO: RLS deja escribir a cualquiera',
    'Ejecuta supabase/schema.sql entero, incluida la línea `alter table ... enable row level security`',
  );
  await supabase.from('progreso').delete().eq('novela_slug', '__prueba_rls__');
}

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log(
  fallos === 0
    ? '\n\x1b[32mTodo listo.\x1b[0m Arranca con `npm run dev` y prueba el botón de Google.\n'
    : `\n${fallos} cosa(s) por arreglar. Corre esto otra vez cuando las hagas.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
