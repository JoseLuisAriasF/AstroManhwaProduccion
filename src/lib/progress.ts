import type { UserProgress } from '@/types/novela';
import { supabase } from './supabaseClient';

const KEY = 'mtn:progress';
type Store = Record<string, UserProgress>;

let cache: Store = leerLocal();
let userId: string | null = null;

function leerLocal(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function guardarLocal() {
  localStorage.setItem(KEY, JSON.stringify(cache));
  window.dispatchEvent(new CustomEvent('progress:change', { detail: cache }));
}

export function get(slug: string): UserProgress {
  return cache[slug] ?? { novelaSlug: slug, capitulosLeidos: [], esFavorito: false };
}

export function getAll(): Store {
  return cache;
}

export function leido(slug: string, numero: number): boolean {
  return get(slug).capitulosLeidos.includes(numero);
}

export function toggleCapitulo(slug: string, numero: number): boolean {
  const p = get(slug);
  const yaLeido = p.capitulosLeidos.includes(numero);
  p.capitulosLeidos = yaLeido
    ? p.capitulosLeidos.filter((n) => n !== numero)
    : [...p.capitulosLeidos, numero].sort((a, b) => a - b);
  cache[slug] = p;
  guardarLocal();
  subirNube(p);
  return !yaLeido;
}

export function marcarLeido(slug: string, numero: number) {
  if (!leido(slug, numero)) toggleCapitulo(slug, numero);
}

export function toggleFavorito(slug: string): boolean {
  const p = get(slug);
  p.esFavorito = !p.esFavorito;
  cache[slug] = p;
  guardarLocal();
  subirNube(p);
  return p.esFavorito;
}

/** Último capítulo leído: sirve para el botón "Continuar leyendo". */
export function ultimoLeido(slug: string): number | null {
  const l = get(slug).capitulosLeidos;
  return l.length ? Math.max(...l) : null;
}

// ---- Nube (solo si hay sesión) ----

async function subirNube(p: UserProgress) {
  if (!supabase || !userId) return;
  await supabase.from('progreso').upsert(
    {
      user_id: userId,
      novela_slug: p.novelaSlug,
      capitulos_leidos: p.capitulosLeidos,
      es_favorito: p.esFavorito,
    },
    { onConflict: 'user_id,novela_slug' },
  );
}

/** Une local y nube sin perder nada: la lectura es acumulativa. */
async function sincronizar(uid: string) {
  if (!supabase) return;
  userId = uid;
  const { data } = await supabase.from('progreso').select('*').eq('user_id', uid);

  for (const fila of data ?? []) {
    const local = cache[fila.novela_slug];
    cache[fila.novela_slug] = {
      userId: uid,
      novelaSlug: fila.novela_slug,
      capitulosLeidos: [
        ...new Set([...(fila.capitulos_leidos ?? []), ...(local?.capitulosLeidos ?? [])]),
      ].sort((a, b) => a - b),
      esFavorito: fila.es_favorito || local?.esFavorito || false,
    };
  }
  guardarLocal();

  // Empuja todo de vuelta (incluye lo que solo existía en este dispositivo).
  for (const p of Object.values(cache)) await subirNube(p);
  window.dispatchEvent(new CustomEvent('progress:synced'));
}

/** Arranca la escucha de sesión. Idempotente, llamar una vez por página. */
export function init() {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      cache = leerLocal();
      window.dispatchEvent(new CustomEvent('progress:change', { detail: cache }));
    }
  });

  if (!supabase) return;
  supabase.auth.onAuthStateChange((_e, session) => {
    const uid = session?.user?.id ?? null;
    window.dispatchEvent(new CustomEvent('auth:change', { detail: session?.user ?? null }));
    if (uid && uid !== userId) sincronizar(uid);
    if (!uid) userId = null;
  });
}
