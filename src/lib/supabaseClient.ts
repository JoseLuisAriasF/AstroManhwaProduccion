import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO CONECTAR GOOGLE OAUTH (todo en capa gratuita, ~15 minutos)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1) Google Cloud Console → https://console.cloud.google.com
 *    · Crea un proyecto → "APIs y servicios" → "Pantalla de consentimiento OAuth"
 *      - Tipo: Externo · Publícala (en modo "Prueba" solo entran 100 correos)
 *      - Dominios autorizados: tudominio.com
 *    · "Credenciales" → Crear credenciales → ID de cliente de OAuth → Aplicación web
 *      - Orígenes JavaScript autorizados:
 *          https://tudominio.com
 *          http://localhost:4321                  (desarrollo)
 *      - URI de redirección autorizado (EXACTO, lo da Supabase):
 *          https://<TU-PROYECTO>.supabase.co/auth/v1/callback
 *    · Copia el "ID de cliente" y el "Secreto de cliente".
 *
 * 2) Supabase → https://supabase.com/dashboard
 *    · Authentication → Providers → Google → Enable
 *      - Client ID     = ID de cliente de Google
 *      - Client Secret = Secreto de cliente de Google
 *    · Authentication → URL Configuration
 *      - Site URL:      https://tudominio.com
 *      - Redirect URLs: https://tudominio.com/**  y  http://localhost:4321/**
 *    · SQL Editor → ejecuta supabase/schema.sql (tabla `progreso` + RLS).
 *
 * 3) Este proyecto → copia .env.example a .env y rellena:
 *      PUBLIC_SUPABASE_URL=https://<TU-PROYECTO>.supabase.co
 *      PUBLIC_SUPABASE_ANON_KEY=<anon public key>   (Settings → API)
 *    En Cloudflare Pages: las mismas dos variables en Settings → Environment variables.
 *
 * La `anon key` es pública por diseño: lo que protege los datos es RLS, no la clave.
 * El secreto de Google nunca sale del panel de Supabase ni entra en este repo.
 *
 * Sin estas variables el sitio compila y funciona igual, en modo invitado
 * (progreso en localStorage). Por eso se puede desplegar antes de tener cuenta.
 */

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const hayNube = Boolean(url && key);

/** null si no hay credenciales: el sitio sigue funcionando en modo invitado. */
export const supabase: SupabaseClient | null = hayNube
  ? createClient(url, key, {
      auth: {
        persistSession: true, // sesión en localStorage
        autoRefreshToken: true,
        detectSessionInUrl: true, // procesa el token del retorno de Google
        flowType: 'pkce',
      },
    })
  : null;

/** Un clic: Google devuelve al usuario a la misma página donde estaba. */
export async function loginConGoogle() {
  if (!supabase) {
    console.warn('[auth] Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY');
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) console.error('[auth]', error.message);
}

export async function logout() {
  await supabase?.auth.signOut();
  location.reload();
}
