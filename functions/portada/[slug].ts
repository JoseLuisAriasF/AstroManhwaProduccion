/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /portada/<slug>.jpg — la portada, servida desde NUESTRO dominio
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes cada `<img>` apuntaba al sitio de origen. Eso tiene tres costes:
 *
 *  1. Google Imágenes indexa la portada bajo el dominio de la scan, no el
 *     nuestro. En este nicho la búsqueda por portada es tráfico de verdad y se
 *     lo estaba llevando entero otro sitio.
 *  2. `og:image` en otro dominio: varias redes descartan la vista previa.
 *  3. Cuando la scan borra la imagen o bloquea el hotlinking, la ficha enseña un
 *     ícono roto. El respaldo por JS (`data-fb`) tapa eso para la persona, pero
 *     un rastreador no ejecuta JS: para Google la portada seguía rota.
 *
 * Por qué un proxy y no copiar las imágenes: **almacenamiento gratis siempre
 * tiene tope** (Supabase Storage da 1 GB, R2 da 10 GB) y 8.600 portadas lo van
 * comiendo sin parar. Aquí no se guarda NADA: la primera petición trae la imagen
 * del origen y la respuesta se queda en la caché de Cloudflare, que sí es gratis
 * e ilimitada. Las siguientes visitas se sirven del edge sin ejecutar esta
 * función siquiera —por eso el `Cache-Control` largo no es un detalle, es lo que
 * mantiene el coste en cero—.
 *
 * Los destinos posibles salen de `/portadas.json` (generado en el build): la
 * lista es cerrada. Sin eso, llevar la URL en la ruta convertiría el dominio en
 * un proxy abierto que cualquiera podría usar para pedir lo que quisiera.
 *
 * Firma sin los tipos de Cloudflare (no están instalados), igual que
 * `functions/_middleware.ts`.
 */

/** Una semana en el navegador, un mes en el edge: la portada de una obra
 *  cambia como mucho cuando se sustituye a mano desde /admin. */
const CACHE = {
  'Cache-Control': 'public, max-age=604800',
  'CDN-Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=2592000',
};

/** El mapa vive en el isolate: se descarga una vez por PoP, no por petición. */
let mapa: Promise<Record<string, string[]>> | null = null;

const catalogo = (origen: string) =>
  (mapa ??= fetch(new URL('/portadas.json', origen).toString())
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))) as Promise<Record<string, string[]>>;

export const onRequest = async (context: {
  request: Request;
  params: { slug: string | string[] };
}): Promise<Response> => {
  const url = new URL(context.request.url);
  const sinPortada = () => Response.redirect(new URL('/portadas/sin-portada.svg', url).toString(), 302);

  // `/portada/mi-obra.jpg` → `mi-obra`. La extensión existe para que el archivo
  // parezca una imagen (buscadores y redes miran la URL además del tipo MIME).
  const bruto = Array.isArray(context.params.slug) ? context.params.slug[0] : context.params.slug;
  const slug = String(bruto ?? '').replace(/\.(jpg|jpeg|png|webp|avif|gif)$/i, '');
  if (!slug) return sinPortada();

  const candidatas = (await catalogo(url.origin))[slug];
  if (!candidatas?.length) return sinPortada();

  for (const destino of candidatas) {
    try {
      // `Referer` del propio origen: varias scans sirven un cartel de "no
      // hotlinking" cuando no lo ven, y ese cartel llega con 200 y tipo imagen,
      // así que no se distingue de una portada buena — mejor no provocarlo.
      const r = await fetch(destino, {
        headers: {
          Referer: new URL(destino).origin + '/',
          'User-Agent': context.request.headers.get('user-agent') ?? 'Mozilla/5.0',
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      const tipo = r.headers.get('content-type') ?? '';
      if (!r.ok || !tipo.startsWith('image/')) continue;
      return new Response(r.body, {
        headers: { ...CACHE, 'Content-Type': tipo, 'X-Portada-Origen': new URL(destino).hostname },
      });
    } catch {
      // Origen caído o DNS muerto: se prueba la siguiente fuente.
    }
  }
  return sinPortada();
};
