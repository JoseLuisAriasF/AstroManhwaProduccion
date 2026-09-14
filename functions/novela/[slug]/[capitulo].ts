/**
 * ─────────────────────────────────────────────────────────────────────────────
 * /novela/<slug>/capitulo-<N> — una página por capítulo, generada en el edge
 * ─────────────────────────────────────────────────────────────────────────────
 * «monte hua cap 1200», «… manhwa 1200», «… novel 1200» es la consulta más
 * repetida del nicho, y la respondía la ficha entera: un título que habla de la
 * obra, no del capítulo. Quien busca un capítulo quiere una página que se llame
 * como su búsqueda.
 *
 * **Por qué en el edge y no en el build.** Son ~200.000 URLs. Cloudflare Pages
 * admite 20.000 archivos por despliegue y el sitio ya usa la mitad: generarlas
 * estáticas no es "lento", es imposible. Aquí no se genera ningún archivo: la
 * función arma el HTML al recibir la primera petición y la respuesta se queda en
 * la caché del edge un día. Las siguientes visitas —y los siguientes rastreos—
 * ni ejecutan la función.
 *
 * **Y no son páginas calcadas.** Cada una lleva lo que solo se sabe de ESE
 * capítulo: qué fuentes lo tienen (no todas llegan al 1200), y por qué capítulo
 * de la novela va la historia en ese punto, que sale de interpolar las anclas
 * con la misma fórmula que el resto del sitio (`src/lib/equivalencia.ts`, que se
 * importa, no se copia). Sin eso serían páginas puente, que es justo lo que
 * Google castiga.
 *
 * Un capítulo que no existe devuelve **404**, no una página vacía con 200: a
 * esta escala los soft-404 son la forma más rápida de que el dominio entero
 * pierda confianza.
 *
 * Firma sin los tipos de Cloudflare (no están instalados), igual que
 * `functions/_middleware.ts` y `functions/portada/[slug].ts`.
 */
// Con extensión: así el módulo lo resuelven igual esbuild (que es quien
// empaqueta esto para Cloudflare) y Node a secas, que es como lo prueba
// `npm run test:capitulo` sin levantar nada.
import { manhwaANovela } from '../../../src/lib/equivalencia.ts';
// El mismo visor que la ficha: la lista de dominios que se pueden proxear vive
// en un solo sitio (`src/lib/fuentes.ts`), no copiada aquí.
import { esFuenteDelCatalogo, urlDeLectura } from '../../../src/lib/fuentes.ts';
import { esProhibida } from '../../../src/lib/indexacion.ts';
import { tituloIngles as tituloInglesDe } from '../../../src/lib/titulos.ts';

/** Un día en el edge, una hora en el navegador: aparece un capítulo nuevo o una
 *  fuente nueva y la página se rehace sola al día siguiente. */
const CACHE = {
  'Cache-Control': 'public, max-age=3600',
  'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
};

/** El 404 vive mucho menos: un capítulo aparece cada noche, y guardar un día
 *  el "todavía no está" retrasaría justo el momento que más tráfico trae. */
const CACHE_404 = {
  'Cache-Control': 'public, max-age=300',
  'CDN-Cache-Control': 'public, s-maxage=1800',
};

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** El host, o cadena vacía si la scan guardó una URL que no lo es. `new URL`
 *  lanza, y aquí lanzar es un 500 en una página que Google está rastreando. */
const dominio = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Los ids de las fuentes que no listan capítulos, del archivo que genera el
 *  build. Se descarga UNA vez por isolate (no por petición), igual que el proxy
 *  de portadas hace con `/portadas.json`. Si falla, el conjunto va vacío: se
 *  publican de más antes que de menos, porque un 404 en una URL que sí está en
 *  el sitemap es peor que una página con un enlace a un índice. */
let enlace: Promise<Set<string>> | null = null;
const sinLista = (origen: string) =>
  (enlace ??= fetch(new URL('/fuentes-enlace.json', origen).toString())
    .then((r) => (r.ok ? r.json() : []))
    .then((ids) => new Set(ids as string[]))
    .catch(() => new Set<string>()));

/** Las obras (nivel A, manhwa y novela) cuyos capítulos se indexan. Las demás
 *  sirven la página igual, con noindex (ver src/lib/indexacion.ts). Si el
 *  archivo falla, conjunto vacío: todo noindex hasta el siguiente isolate. Aquí
 *  el error barato es el contrario al de `sinLista`: una página sin indexar un
 *  día cuesta poco; 270.000 indexables por un fallo es lo que se quiso evitar. */
let nivelA: Promise<Set<string>> | null = null;
const obrasA = (origen: string) =>
  (nivelA ??= fetch(new URL('/obras-nivel-a.json', origen).toString())
    .then((r) => (r.ok ? r.json() : []))
    .then((slugs) => new Set(slugs as string[]))
    .catch(() => new Set<string>()));

const NOMBRE_IDIOMA: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  id: 'Indonesio',
  fr: 'Francés',
  de: 'Alemán',
  vi: 'Vietnamita',
  ko: 'Coreano',
};

interface Env {
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_ANON_KEY?: string;
}

export const onRequest = async (context: {
  request: Request;
  params: { slug: string | string[]; capitulo: string | string[] };
  env: Env;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const uno = (v: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const url = new URL(context.request.url);
  const slug = uno(context.params.slug);
  const segmento = uno(context.params.capitulo);
  const numero = Number(/^capitulo-(\d+)$/.exec(segmento)?.[1]);

  // Cualquier otra cosa bajo /novela/<slug>/ (p. ej. /equivalencia, que es una
  // página estática) sigue su camino: next() sirve el archivo del despliegue.
  // El techo evita que `/capitulo-99999999999` gaste cuatro consultas para
  // acabar en el mismo 404: ninguna obra pasa de cinco cifras.
  if (!numero || !Number.isFinite(numero) || numero > 99_999) return context.next();

  // `capitulo-007` y `capitulo-7` son la misma página. Sin este 301 serían dos
  // URLs con el mismo contenido, que es contenido duplicado multiplicado por
  // 200.000. La forma canónica es la del sitemap: sin ceros a la izquierda.
  if (segmento !== `capitulo-${numero}`) {
    const canonica = new URL(url);
    canonica.pathname = `/novela/${slug}/capitulo-${numero}`;
    return Response.redirect(canonica.toString(), 301);
  }

  const base = context.env.PUBLIC_SUPABASE_URL;
  const clave = context.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !clave) return context.next();

  const rest = async <T>(consulta: string): Promise<T[]> => {
    const r = await fetch(`${base}/rest/v1/${consulta}`, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}` },
    });
    return r.ok ? ((await r.json()) as T[]) : [];
  };

  const s = encodeURIComponent(slug);

  // Primero, quién NO lista capítulos. Olympus y su clase guardan UNA fila por
  // obra con el TOTAL en `numero` y la URL de la serie —{ numero: 18, titulo:
  // 'Serie completa · 18 capítulos' }—: ese 18 no es un capítulo al que
  // enlazar, y hay que sacarlo de TODAS las consultas, también de anterior y
  // siguiente, o el enlace «Capítulo 18 →» apuntaría a un 404.
  //
  // La lista se calcula en el build con el mismo código que la ficha y se
  // publica en /fuentes-enlace.json (ver src/lib/soloEnlace.ts). Aquí no se
  // recalcula ni se aproxima: el primer intento usó `fuentes.n_caps` —que es lo
  // que vio el último scrapeo, no lo que hay guardado— y dejaba 14.638 URLs del
  // sitemap devolviendo 404.
  //
  // Cuando el capítulo pedido es el 1 no se excluye nada: una fuente con un
  // solo capítulo publicado sí tiene el capítulo 1 de verdad.
  const soloEnlace = numero > 1 ? await sinLista(url.origin) : new Set<string>();

  const [fuentes, obras, indexables] = await Promise.all([
    rest<any>(`fuentes?obra_slug=eq.${s}&select=id,nombre`),
    rest<any>(`obras?slug=eq.${s}&publicada=eq.true&select=titulo,titulos_alternativos,tipo,categorias&limit=1`),
    obrasA(url.origin),
  ]);
  const excluidas = fuentes.filter((f: any) => soloEnlace.has(f.id)).map((f: any) => f.id);
  const reales = excluidas.length ? `&fuente_id=not.in.(${excluidas.join(',')})` : '';

  const [caps, anclas, previos, siguientes] = await Promise.all([
    rest<any>(
      `capitulos_externos?obra_slug=eq.${s}&numero=eq.${numero}&aprobado=eq.true${reales}&select=titulo,url,tipo,idioma,fuente_id`,
    ),
    rest<any>(`equivalencias?novela_slug=eq.${s}&select=capitulo_manhwa,capitulo_novela`),
    rest<any>(
      `capitulos_externos?obra_slug=eq.${s}&numero=lt.${numero}&aprobado=eq.true${reales}&select=numero&order=numero.desc&limit=1`,
    ),
    rest<any>(
      `capitulos_externos?obra_slug=eq.${s}&numero=gt.${numero}&aprobado=eq.true${reales}&select=numero&order=numero.asc&limit=1`,
    ),
  ]);

  // Lo prohibido no existe en el sitio (el build no genera su ficha): tampoco aquí.
  const obra = obras.find((o: any) => !esProhibida(o.categorias ?? []));
  // Con barra final: es la URL canónica de la ficha. Sin ella, cada enlace de
  // esta página hacia la ficha costaba un 308.
  const ficha = `${url.origin}/novela/${slug}/`;

  // Sin obra o sin ese capítulo en ninguna fuente que lo enlace de verdad: 404.
  // La página ofrece la ficha, que es donde está la lista completa.
  if (!obra || !caps.length) {
    return new Response(
      pagina({
        titulo: obra ? `${obra.titulo} — el capítulo ${numero} todavía no está` : 'Capítulo no encontrado',
        descripcion: obra
          ? `El capítulo ${numero} de ${obra.titulo} aún no está indexado en ninguna fuente.`
          : 'Ese capítulo no existe en el catálogo.',
        noindex: true,
        cuerpo: `<h1>${esc(obra?.titulo ?? 'Capítulo no encontrado')}${obra ? ` — capítulo ${numero}` : ''}</h1>
        <p>Ese capítulo no está indexado${obra ? ' todavía' : ''}. ${
          obra ? `<a href="${esc(ficha)}">Mira la lista completa de ${esc(obra.titulo)}</a>.` : '<a href="/">Volver al inicio</a>.'
        }</p>`,
      }),
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CACHE_404 } },
    );
  }

  const nombreFuente = new Map(fuentes.map((f: any) => [f.id, f.nombre]));
  // El inglés de verdad (ver src/lib/titulos.ts): «| Stop Summoning Me! Chapter 6»,
  // no «| Bie Zai Zhaohuan Wo La! Chapter 6».
  const tituloIngles = tituloInglesDe({ titulo: obra.titulo, titulosAlternativos: obra.titulos_alternativos ?? [] });
  const alternos = ((obra.titulos_alternativos ?? []) as string[]).slice(0, 4);

  // El dato que solo tiene este sitio: por qué capítulo de la novela va la
  // historia cuando el manhwa va por este. Misma fórmula que la ficha.
  const enNovela = manhwaANovela(
    anclas.map((a: any) => ({ capituloManhwa: a.capitulo_manhwa, capituloNovela: a.capitulo_novela })),
    numero,
  );

  // El `href` a la fuente y el `target="_blank"` se quedan siempre: si el JS no
  // corre, el enlace hace lo de siempre. El visor es una mejora encima.
  const filas = caps
    .map((c: any) => {
      const etiqueta = c.tipo === 'manhwa' ? 'Manhwa' : 'Novela';
      const idioma = NOMBRE_IDIOMA[c.idioma] ?? String(c.idioma).toUpperCase();
      const donde = nombreFuente.get(c.fuente_id) || dominio(c.url) || 'la fuente';
      const visor = esFuenteDelCatalogo(c.url)
        ? ` data-visor="${esc(urlDeLectura(c.url))}" data-donde="${esc(donde)}" data-titulo="${esc(
            `${obra.titulo} · Capítulo ${numero}`,
          )}"`
        : '';
      return `<li><a href="${esc(c.url)}" rel="noopener nofollow" target="_blank"${visor}><strong>${esc(donde)}</strong>
        <span>${esc(etiqueta)} en ${esc(idioma)}</span></a></li>`;
    })
    .join('\n');

  const formatos = [...new Set(caps.map((c: any) => c.tipo))] as string[];
  const comoTexto = formatos.map((f) => (f === 'manhwa' ? 'manhwa' : 'novela')).join(' y ');
  const prev = previos[0]?.numero as number | undefined;
  const next = siguientes[0]?.numero as number | undefined;

  const titulo = `${obra.titulo} Capítulo ${numero} — dónde leerlo${
    tituloIngles && tituloIngles !== obra.titulo ? ` | ${tituloIngles} Chapter ${numero}` : ''
  }`;
  const descripcion = `El capítulo ${numero} de ${obra.titulo} está en ${caps.length} ${
    caps.length === 1 ? 'fuente' : 'fuentes'
  } (${comoTexto}), con el enlace al sitio original.${
    enNovela ? ` Si vas por el capítulo ${numero} del manhwa, la novela va por el ${enNovela}.` : ''
  }`;

  const cuerpo = `
    <nav class="migas"><a href="/">Inicio</a> / <a href="${esc(ficha)}">${esc(obra.titulo)}</a> / Capítulo ${numero}</nav>
    <h1>${esc(obra.titulo)} — Capítulo ${numero}</h1>
    ${
      tituloIngles && tituloIngles !== obra.titulo
        ? `<p class="alt">${esc(tituloIngles)} Chapter ${numero}</p>`
        : ''
    }
    <p class="respuesta">El capítulo ${numero} de ${esc(obra.titulo)} está indexado en ${caps.length}
      ${caps.length === 1 ? 'fuente' : 'fuentes'} (${esc(comoTexto)}). Se abre aquí mismo, en una ventana
      y sin publicidad, sin salir de la página.</p>
    ${
      enNovela
        ? `<p class="respuesta">Si vas por el <strong>capítulo ${numero} del manhwa</strong>, la novela va por el
           <strong>capítulo ${enNovela}</strong>. <a href="${esc(ficha)}equivalencia/">Ver la equivalencia completa</a>.</p>`
        : ''
    }
    <h2>Dónde leer el capítulo ${numero}</h2>
    <ul class="fuentes">${filas}</ul>
    <nav class="paso">
      ${prev ? `<a href="${esc(ficha)}capitulo-${prev}">← Capítulo ${prev}</a>` : '<span></span>'}
      <a href="${esc(ficha)}">Todos los capítulos</a>
      ${next ? `<a href="${esc(ficha)}capitulo-${next}">Capítulo ${next} →</a>` : '<span></span>'}
    </nav>
    ${
      alternos.length
        ? `<p class="alt">También buscada como ${alternos.map((a) => esc(a)).join(' · ')}.</p>`
        : ''
    }

    <!-- Saltar a cualquier capítulo. Con 2.000 capítulos, «anterior/siguiente»
         no sirve para llegar al 1200: se escribe el número y ya. Es un <form>
         de verdad, así que el Intro del teclado móvil también vale. -->
    <h2>Ir a otro capítulo</h2>
    <form class="ir" data-ficha="${esc(ficha)}">
      <label for="ir-n">Número de capítulo</label>
      <input id="ir-n" name="n" type="number" inputmode="numeric" min="1" max="99999" placeholder="${numero}" required>
      <button>Ir</button>
    </form>

    <!-- El visor: el capítulo encima de esta página, en vez de mandar al lector
         a otra pestaña. Es el mismo de la ficha —/leer trae el capítulo desde el
         sitio y le quita la publicidad con su CSP— y con el mismo sandbox: sin
         allow-popups (popunders), sin allow-same-origin (nuestro localStorage)
         y sin allow-top-navigation (frame-busting). -->
    <dialog class="visor">
      <header>
        <span data-t></span>
        <a data-a target="_blank" rel="noopener nofollow"></a>
        <button data-x aria-label="Cerrar" title="Cerrar (Esc)">✕</button>
      </header>
      <iframe data-f title="Capítulo" sandbox="allow-scripts allow-forms"></iframe>
    </dialog>

    <script>
    (function(){
      var d=document.querySelector('.visor');
      // Un click con ctrl/cmd/shift o con el botón central sigue abriendo
      // pestaña: secuestrar eso es la forma más rápida de que el visor estorbe.
      if(d&&d.showModal){
        var f=d.querySelector('[data-f]'),t=d.querySelector('[data-t]'),a=d.querySelector('[data-a]');
        var cerrar=function(){f.removeAttribute('src');d.close();};
        Array.prototype.forEach.call(document.querySelectorAll('a[data-visor]'),function(el){
          el.addEventListener('click',function(e){
            if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button)return;
            e.preventDefault();
            t.textContent=el.getAttribute('data-titulo');
            a.href=el.href;a.textContent='Abrir en '+el.getAttribute('data-donde')+' \\u2197';
            // Abrir ANTES de pedir el capítulo: mientras el dialog está cerrado
            // es display:none, y hay navegadores que no cargan el iframe de un
            // elemento sin pintar.
            d.showModal();
            f.src=el.getAttribute('data-visor');
          });
        });
        d.querySelector('[data-x]').addEventListener('click',cerrar);
        d.addEventListener('click',function(e){if(e.target===d)cerrar();});
        // Vaciar el marco en las tres salidas: si no, la scan sigue viva detrás.
        d.addEventListener('cancel',function(){f.removeAttribute('src');});
        d.addEventListener('close',function(){f.removeAttribute('src');});
      }
      var ir=document.querySelector('.ir');
      if(ir)ir.addEventListener('submit',function(e){
        e.preventDefault();
        var n=parseInt(ir.n.value,10);
        if(n>0)location.href=ir.getAttribute('data-ficha')+'capitulo-'+n;
      });
    })();
    </script>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${url.origin}/` },
      { '@type': 'ListItem', position: 2, name: obra.titulo, item: ficha },
      { '@type': 'ListItem', position: 3, name: `Capítulo ${numero}` },
    ],
  };

  return new Response(
    pagina({
      titulo,
      descripcion,
      canonical: `${ficha}capitulo-${numero}`,
      imagen: `${url.origin}/portada/${slug}.jpg`,
      prev: prev ? `${ficha}capitulo-${prev}` : undefined,
      next: next ? `${ficha}capitulo-${next}` : undefined,
      noindex: !indexables.has(slug),
      jsonLd,
      cuerpo,
    }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8', ...CACHE } },
  );
};

/**
 * El HTML, entero y con su CSS dentro. No reutiliza el layout de Astro a
 * propósito: el CSS del sitio vive en un archivo con hash que esta función no
 * puede conocer, y una hoja de estilos externa costaría un viaje extra en la
 * página que más rápido tiene que abrirse. Son 30 líneas de CSS y no hay que
 * mantener dos diseños: esta página es una lista de enlaces, no la ficha.
 */
function pagina(o: {
  titulo: string;
  descripcion: string;
  cuerpo: string;
  canonical?: string;
  imagen?: string;
  prev?: string;
  next?: string;
  noindex?: boolean;
  jsonLd?: unknown;
}): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.titulo)}</title>
<meta name="description" content="${esc(o.descripcion)}">
${o.noindex ? '<meta name="robots" content="noindex, follow">' : ''}
${o.canonical ? `<link rel="canonical" href="${esc(o.canonical)}">` : ''}
${o.prev ? `<link rel="prev" href="${esc(o.prev)}">` : ''}
${o.next ? `<link rel="next" href="${esc(o.next)}">` : ''}
<meta property="og:title" content="${esc(o.titulo)}">
<meta property="og:description" content="${esc(o.descripcion)}">
<meta property="og:type" content="article">
${o.imagen ? `<meta property="og:image" content="${esc(o.imagen)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(o.imagen)}">` : ''}
<meta property="og:site_name" content="ManhwaToNovel">
${o.canonical ? `<meta property="og:url" content="${esc(o.canonical)}">` : ''}
<meta name="theme-color" content="#171b24">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{color-scheme:light dark;--bg:#eef1f6;--card:#fff;--tx:#2b3140;--sub:#6b7280;--ac:#5b6cff}
@media(prefers-color-scheme:dark){:root{--bg:#171b24;--card:#1e2431;--tx:#e7eaf0;--sub:#9aa2b1}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:44rem;margin:0 auto;padding:2rem 1rem 3rem}
a{color:var(--ac);text-decoration:none}a:hover{text-decoration:underline}
.migas{font-size:.85rem;color:var(--sub);margin-bottom:1.25rem}
.migas a{color:var(--sub)}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 .25rem}
h2{font-size:1.1rem;margin:2rem 0 .75rem}
.alt{color:var(--sub);font-size:.95rem;margin:.25rem 0 0}
.respuesta{margin:1rem 0 0}
.fuentes{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
.fuentes a{display:flex;justify-content:space-between;gap:1rem;align-items:baseline;
  background:var(--card);border-radius:.75rem;padding:.75rem 1rem;color:var(--tx)}
.fuentes span{color:var(--sub);font-size:.85rem;white-space:nowrap}
.paso{display:flex;justify-content:space-between;gap:1rem;margin-top:2rem;font-size:.95rem}
.ir{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.ir label{color:var(--sub);font-size:.9rem}
.ir input{width:7rem;padding:.6rem .75rem;border:0;border-radius:.75rem;background:var(--card);color:var(--tx);font:inherit}
.ir button{padding:.6rem 1.25rem;border:0;border-radius:.75rem;background:var(--ac);color:#fff;font:inherit;cursor:pointer}
dialog.visor{width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#171b24}
dialog.visor::backdrop{background:rgba(0,0,0,.8)}
dialog.visor header{display:flex;align-items:center;gap:.75rem;height:2.75rem;padding:0 .75rem;color:#e7eaf0;font-size:.9rem}
dialog.visor header span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
dialog.visor header a{margin-left:auto;flex:none;font-size:.8rem;color:#8b9aff}
/* 2,75rem = 44 px: el mínimo que se acierta con el pulgar sin mirar. Cerrar
   rápido es la mitad del valor de leer aquí dentro. */
dialog.visor header button{flex:none;width:2.75rem;height:2.75rem;margin-right:-.5rem;border:0;background:none;color:#9aa2b1;font-size:1.25rem;line-height:1;cursor:pointer}
dialog.visor iframe{display:block;width:100%;height:calc(100dvh - 2.75rem);border:0;background:#fff}
</style>
${o.jsonLd ? `<script type="application/ld+json">${JSON.stringify(o.jsonLd)}</script>` : ''}
</head>
<body><main>${o.cuerpo}</main></body>
</html>`;
}
