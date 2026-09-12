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
  'referrer-policy',
  'set-cookie',
  'content-encoding',
  'content-length',
  'transfer-encoding',
]);

/** CDNs que usan las propias scans para jQuery y el visor de imágenes. No son
 *  redes de anuncios, y sin ellas se cae el lector de unas cuantas: son la
 *  excepción a «solo scripts de la fuente». */
const CDNS =
  'https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://code.jquery.com https://ajax.googleapis.com https://unpkg.com';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * La publicidad, fuera: una CSP y no una lista de bloqueo
 * ─────────────────────────────────────────────────────────────────────────────
 * Un filtro por dominios (lo que hace uBlock) hay que mantenerlo, y una red de
 * anuncios se cambia de dominio en una tarde. Aquí no hace falta: el capítulo lo
 * sirve esta función, así que al documento se le pone una `Content-Security-
 * Policy` NUESTRA —la de la fuente ya se cae en FUERA— que dice de dónde puede
 * ejecutarse JavaScript: **de la fuente y de nadie más**.
 *
 * Eso saca de un golpe a AdSense, a los popunders y a los rastreadores, también
 * a los que inyecta en caliente el JS de la scan, que es lo que ninguna limpieza
 * del HTML puede pillar: cuando el HTML pasa por aquí todavía no están escritos.
 *
 * `img-src *` y `connect-src *` van abiertos a propósito: el capítulo son
 * imágenes y muchas viven en un CDN que no es el de la fuente. Se cierra lo que
 * ejecuta código y lo que enmarca: los marcos, solo de la fuente, porque un
 * <iframe> ajeno en una página de capítulo es un anuncio y no el capítulo.
 */
function politica(base: string): string {
  let propio = '';
  try {
    const u = new URL(base);
    const raiz = u.hostname.replace(/^www\./, '');
    // Set: con www. el origen y la raíz son lo mismo, y la cabecera salía con
    // el dominio repetido.
    propio = [...new Set([u.origin, `https://${raiz}`, `https://*.${raiz}`])].join(' ');
  } catch {}
  return [
    `default-src 'self' data: blob: ${propio}`,
    'img-src * data: blob:',
    'media-src * data: blob:',
    "style-src * 'unsafe-inline'",
    'font-src * data:',
    'connect-src *',
    // 'unsafe-inline'/'unsafe-eval': el JS propio de las scans es casi todo
    // inline. Sin ellos no se cae la publicidad, se cae el capítulo.
    `script-src ${propio} 'unsafe-inline' 'unsafe-eval' ${CDNS}`,
    // Solo los marcos de la propia fuente, que son los que el HTML conserva
    // (ver `ajeno`). Un <iframe> de otro sitio en una página de capítulo es un
    // anuncio, no el capítulo. Sin `propio` la lista queda vacía, que en CSP
    // significa 'none': falla cerrado.
    `frame-src ${propio}`,
    "object-src 'none'",
  ].join('; ');
}

/**
 * La otra mitad de 2026: apagar la publicidad que YA NO necesita un script.
 *
 * Con el tercer party cookie muerto, la industria se mudó a APIs que trae el
 * propio navegador —Topics, Protected Audience (antes FLEDGE), Attribution
 * Reporting, Shared Storage—: son subastas y perfilado que ocurren DENTRO de
 * Chrome, así que una CSP no las ve pasar. `Permissions-Policy` es lo que las
 * apaga, y con `()` —lista vacía— se apagan para el documento y para todo lo que
 * cuelgue de él. De paso caen cámara, micrófono y geolocalización, que en una
 * página de capítulo no pintan nada.
 *
 * Un navegador que no conozca una directiva la ignora sin romper nada, así que
 * la lista puede llevar las de hoy y las de pasado mañana.
 */
const PERMISOS = [
  'browsing-topics=()',
  'interest-cohort=()',
  'join-ad-interest-group=()',
  'run-ad-auction=()',
  'attribution-reporting=()',
  'shared-storage=()',
  'shared-storage-select-url=()',
  'private-aggregation=()',
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'display-capture=()',
  'midi=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'idle-detection=()',
].join(', ');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * El almacenamiento de mentira
 * ─────────────────────────────────────────────────────────────────────────────
 * El iframe va sin `allow-same-origin` a propósito: el documento lo sirve NUESTRO
 * dominio, así que con ese permiso el JS de la scan leería nuestro localStorage
 * —progreso y sesión incluidos—. Sin él, el navegador le da un origen opaco.
 *
 * Y en un origen opaco, `localStorage` no devuelve vacío: **lanza**. El tema de
 * WordPress que usan casi todas (Madara) lo lee al arrancar para recuperar el
 * modo de lectura; si eso revienta, el script muere antes de mostrar el
 * capítulo y quedan 36 imágenes en el HTML detrás de una pantalla en blanco.
 *
 * Esto le pone delante un almacenamiento en memoria, que es lo que la página de
 * verdad necesita: guardar el modo de lectura mientras dura la visita. Se define
 * ANTES que cualquier script suyo, y solo si el de verdad no funciona: cuando el
 * navegador lo permite, no se toca nada. Es prevención, no una avería vista: no
 * hemos podido reproducir un origen opaco en un navegador de verdad.
 */
const REMIENDO = `<script>(function(){
function mem(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},
setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},
key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}}
function poner(o,n){try{Object.defineProperty(o,n,{value:mem(),configurable:true})}catch(e){}}
try{window.localStorage.getItem('_')}catch(e){poner(window,'localStorage')}
try{window.sessionStorage.getItem('_')}catch(e){poner(window,'sessionStorage')}
try{document.cookie}catch(e){var c='';try{Object.defineProperty(document,'cookie',
{get:function(){return c},set:function(v){c=String(v).split(';')[0]},configurable:true})}catch(_){}}
})();<\/script>`;

/** Lo que la CSP no puede quitar: el HUECO. El anuncio no carga, pero su caja
 *  sigue midiendo 250 px y empujando el capítulo. Lista corta y literal a
 *  propósito: un selector amplio (`[class*="ad"]`) se lleva por delante medio
 *  tema de WordPress. */
const COSMETICA =
  '<style>ins.adsbygoogle,.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[aria-label="Advertisement" i]{display:none!important}</style>';

/** ¿El <iframe> es de otro sitio? Los ajenos —y los que vienen sin `src`, que
 *  son el hueco que después rellena un script de anuncios— sobran. */
function ajeno(src: string | null, base: string): boolean {
  if (!src) return true;
  try {
    const host = (u: string, b?: string) => new URL(u, b).hostname.replace(/^www\./, '');
    return host(src, base) !== host(base);
  } catch {
    return true;
  }
}

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

  // `redirect: 'follow'` puede acabar en otra URL: el <base> —y la CSP— tienen
  // que mirar a la FINAL, o las rutas relativas se resuelven contra la de
  // partida y no cargan.
  const base = origen.url || destino;

  const cabeceras = new Headers();
  origen.headers.forEach((v, k) => {
    if (!FUERA.has(k.toLowerCase())) cabeceras.set(k, v);
  });
  cabeceras.set('Cache-Control', CACHE);
  // Que nadie más lo enmarque a su vez, y que no se indexe: la página buena
  // para Google es /novela/<slug>/capitulo-N, no esta.
  cabeceras.set('X-Robots-Tag', 'noindex, nofollow');
  // La nuestra, ahora que la de la fuente se ha caído: es lo que deja el
  // capítulo sin anuncios (ver `politica`).
  cabeceras.set('Content-Security-Policy', politica(base));
  // Y las subastas de anuncios que el navegador corre por su cuenta, sin script
  // que bloquear (ver `PERMISOS`).
  cabeceras.set('Permissions-Policy', PERMISOS);
  // ── Sin Referer, o el capítulo sale en blanco ──────────────────────────────
  // Casi todas las scans tienen protección anti-hotlink: la imagen se sirve si
  // la pide su propia página y da 403 si el Referer es de otro sitio. Medido en
  // imperiomanhua: sin Referer 200 y 436 KB, con el nuestro 403 y 17 bytes. El
  // HTML llegaba perfecto y el lector veía 36 imágenes rotas.
  //
  // `no-referrer` es lo único que lo arregla desde aquí: el navegador pide las
  // imágenes sin decir de dónde viene y la protección las deja pasar. Nunca es
  // peor que mandar el nuestro, que es justo el caso que bloquean.
  cabeceras.set('Referrer-Policy', 'no-referrer');
  // Marca de versión: sirve para confirmar de un vistazo qué build de esta
  // función está viva en el edge (los deploys de Pages pueden tardar en
  // propagar la función aunque el estático ya esté).
  cabeceras.set('X-Visor-Rev', 'img-2');

  // Lo que no es HTML se devuelve tal cual (una imagen suelta, un PDF…).
  if (!(origen.headers.get('content-type') ?? '').includes('text/html')) {
    return new Response(origen.body, { status: origen.status, headers: cabeceras });
  }

  // `transform()` YA devuelve una Response. Envolverla en otra `new Response()`
  // la trata como cuerpo y tira el status y las cabeceras —incluido el trabajo
  // de quitar el X-Frame-Options—, que es justo lo que se venía a hacer.
  return new HTMLRewriter()
    // Un <base> propio pisa al que traiga la página, así que primero se quita
    // el suyo. Sin esto, una scan con <base href="/"> rompe todas sus rutas.
    .on('base', { element: (e: any) => e.remove() })
    .on('head', {
      element: (e: any) => {
        // El remiendo va lo PRIMERO de todo: si un script suyo corre antes, ya
        // ha reventado. `prepend` mete al principio del <head>.
        e.prepend(`<base href="${base}">${REMIENDO}`, { html: true });
        e.append(COSMETICA, { html: true });
      },
    })
    // La CSP impide que el anuncio CARGUE, pero su hueco sigue ahí empujando el
    // capítulo hacia abajo. Estos dos son casi todos los huecos: el bloque de
    // AdSense y el marco de la red de turno.
    .on('ins.adsbygoogle', { element: (e: any) => e.remove() })
    .on('iframe', {
      element: (e: any) => {
        if (ajeno(e.getAttribute('src'), base)) e.remove();
      },
    })
    // ── El «escudo» anti-embed (leemiau) ────────────────────────────────────
    // leemiau sirve el capítulo con las imágenes en blanco: la URL real va en
    // `data-lm-orig-src`, el `src` es un gif de 1px, el <img> va oculto
    // (`display:none`) y un script la dibuja en un <canvas> SOLO si la página
    // corre en leemiau.com. Aquí no lo es, así que el canvas queda a 1×1 y el
    // capítulo sale sin imágenes.
    //
    // La URL real ya está en el HTML y carga sin problema con `no-referrer`
    // (medido: 200 y la imagen entera). Así que se le devuelve al `src` y se le
    // quita el ocultado. Al borrar `data-lm-orig-src` —la marca por la que el
    // script del escudo las busca— y sus `onload/onerror`, el escudo ya no
    // tiene de dónde agarrarlas y no las vuelve a tapar.
    // Selector de ETIQUETA, no de atributo (`img[...]`): el motor de
    // HTMLRewriter que corre en producción no casaba el selector de atributo
    // —sí el de etiqueta—, así que el filtro por `data-lm-orig-src` se hace
    // dentro. Las <img> sin esa marca salen intactas en la primera línea.
    .on('img', {
      element: (e: any) => {
        const real = e.getAttribute('data-lm-orig-src');
        if (!real) return;
        e.setAttribute('src', real);
        e.removeAttribute('data-lm-orig-src');
        e.removeAttribute('data-lm-shield');
        e.removeAttribute('data-lm-done-canvas');
        e.removeAttribute('onload');
        e.removeAttribute('onerror');
        e.removeAttribute('aria-hidden');
        // El escudo oculta con `style="display:none"`; en estas <img> el style
        // es solo eso, así que quitarlo entero las devuelve a la vista.
        e.removeAttribute('style');
      },
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
a{color:#8b9aff}small{color:#9aa2b1}</style></head><body><div>
<p>${esc(motivo)}</p>
<!-- Sin target: esta página se pinta DENTRO de la ventana, y su sandbox no
     abre pestañas. Además el navegador del lector lleva sus cookies y su IP, así
     que a veces carga lo que a nuestro servidor le dio 403. Y si no, la barra de
     la ventana tiene el «Abrir en …», que es el que sí sale del sitio. -->
<p><a href="${esc(destino)}" rel="noopener nofollow">Probar a abrirlo aquí dentro</a></p>
<p><small>Si tampoco carga, arriba está «Abrir en ${esc(donde)} ↗».</small></p>
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
