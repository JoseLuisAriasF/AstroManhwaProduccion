/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /leer?u=<url> — el capítulo, dentro del sitio
 * ─────────────────────────────────────────────────────────────────────────────
 * El visor abría la fuente en un iframe directo, y eso solo funcionaba con el
 * 42,8 % de los capítulos: el resto manda `X-Frame-Options` o `frame-ancestors`
 * y el marco sale en blanco. Esa cabecera la aplica el NAVEGADOR sobre la
 * respuesta que le llega, así que no hay técnica de cliente que la salte: la
 * respuesta tiene que llegar desde aquí.
 *
 * **Qué se guarda: nada.** Esto no es un caché ni una copia. Llega la petición,
 * se pide el HTML a la fuente y se devuelve; cuando termina no queda un byte.
 *
 * **Qué cuesta: una invocación por capítulo abierto.** Solo se proxea el
 * DOCUMENTO. El `<base>` que se inyecta hace que el navegador resuelva las
 * imágenes, el CSS y el JS contra el origen, así que los 20-50 archivos pesados
 * de un capítulo van del lector a la scan sin pasar por aquí. Con 100.000
 * invocaciones diarias en el plan gratis, y el ancho de banda sin medir en
 * Cloudflare, sale gratis de verdad.
 *
 * **HTMLRewriter** y no una plantilla: es el parser en streaming del runtime.
 * La respuesta empieza a salir mientras todavía entra, así que un capítulo de
 * 2 MB de HTML no se guarda entero en memoria ni retrasa el primer pintado.
 *
 * La lista de dominios es CERRADA (`src/lib/fuentes.ts`). Sin eso esto sería un
 * proxy abierto y cualquiera pediría lo que quisiera desde nuestra IP.
 *
 * ⚠ Lo que esto NO garantiza: que una fuente hecha en React pinte igual. Su
 * HTML llega siempre —comprobado, las cinco que bloqueaban el iframe responden
 * 200 a una petición desde el servidor—, pero mangadex y compañía dibujan el
 * capítulo con JS que llama a SU API, y esa llamada sale ahora desde nuestro
 * dominio: si su CORS no lo permite, el capítulo no aparece. Por eso el enlace
 * «Abrir en …» está siempre en la barra del visor.
 *
 * Firma sin los tipos de Cloudflare (no están instalados), igual que las otras
 * funciones. `HTMLRewriter` es un global del runtime, no un import.
 */
import { esFuenteDelCatalogo } from '../src/lib/fuentes.ts';

declare const HTMLRewriter: any;

/** Navegador de verdad: varias scans devuelven 403 a un cliente sin UA. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Cinco minutos. Un capítulo no cambia, pero la página que lo envuelve sí
 *  (anuncios, «leído por N»), y cachear de más congela algo ajeno. Lo justo
 *  para que recargar o volver atrás no gaste otra invocación. */
const CACHE = 'public, max-age=0, s-maxage=300';

/** Cabeceras que NO se copian de la fuente. Las tres primeras son justo las que
 *  impiden mostrar la página aquí; `set-cookie` porque una cookie de la scan en
 *  nuestro dominio no pinta nada y sería una fuga entre sitios. */
const FUERA = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'set-cookie',
  'content-encoding',
  'content-length',
  'transfer-encoding',
]);

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  const destino = new URL(context.request.url).searchParams.get('u') ?? '';
  if (!esFuenteDelCatalogo(destino)) {
    return new Response('Esa dirección no es de una fuente del catálogo.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  let origen: Response;
  try {
    origen = await fetch(destino, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
  } catch {
    return aviso(destino, 'No se pudo conectar con la fuente.');
  }
  if (!origen.ok) return aviso(destino, `La fuente respondió ${origen.status}.`);

  const cabeceras = new Headers();
  origen.headers.forEach((v, k) => {
    if (!FUERA.has(k.toLowerCase())) cabeceras.set(k, v);
  });
  cabeceras.set('Cache-Control', CACHE);
  // Que nadie más lo enmarque a su vez, y que no se indexe: la página buena
  // para Google es /novela/<slug>/capitulo-N, no esta.
  cabeceras.set('X-Robots-Tag', 'noindex, nofollow');

  // Lo que no es HTML se devuelve tal cual (una imagen suelta, un PDF…).
  if (!(origen.headers.get('content-type') ?? '').includes('text/html')) {
    return new Response(origen.body, { status: origen.status, headers: cabeceras });
  }

  // `redirect: 'follow'` puede acabar en otra URL: el <base> tiene que ser la
  // FINAL, o las rutas relativas se resuelven contra la de partida y no cargan.
  const base = origen.url || destino;

  // `transform()` YA devuelve una Response. Envolverla en otra `new Response()`
  // la trata como cuerpo y tira el status y las cabeceras —incluido el trabajo
  // de quitar el X-Frame-Options—, que es justo lo que se venía a hacer.
  return new HTMLRewriter()
    // Un <base> propio pisa al que traiga la página, así que primero se quita
    // el suyo. Sin esto, una scan con <base href="/"> rompe todas sus rutas.
    .on('base', { element: (e: any) => e.remove() })
    .on('head', {
      element: (e: any) => e.prepend(`<base href="${base}">`, { html: true }),
    })
    .transform(new Response(origen.body, { status: origen.status, headers: cabeceras }));
};

/** Cuando la fuente no colabora, una página que lo dice y ofrece la salida.
 *  Un marco en blanco sin explicación es lo peor que puede pasarle al lector. */
function aviso(destino: string, motivo: string): Response {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let donde = 'la fuente';
  try {
    donde = new URL(destino).hostname.replace(/^www\./, '');
  } catch {}
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>No se pudo abrir</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#171b24;color:#e7eaf0;
font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:2rem}
a{color:#8b9aff}</style></head><body><div>
<p>${esc(motivo)}</p>
<p><a href="${esc(destino)}" target="_blank" rel="noopener nofollow">Abrir en ${esc(donde)} ↗</a></p>
</div></body></html>`,
    {
      status: 502,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=60',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}
