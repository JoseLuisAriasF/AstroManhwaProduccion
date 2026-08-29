# ManhwaToNovel

Sitio de lectura de novelas ligeras adaptadas de manhwa. Estático, $0/mes de infraestructura: Cloudflare Pages (build ilimitado en el plan gratis) + Supabase capa gratuita solo para sesión y progreso. El único gasto es el dominio.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ listo para Cloudflare Pages
```

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `tailwind.config.mjs` | Paleta (grises fríos + acento índigo) y sombras neumórficas. Cargado por `@config` desde `global.css`. |
| `src/lib/i18n.ts` | **Idiomas del sitio.** Añadir uno aquí genera sus rutas, hreflang, sitemap y selector. |
| `src/types/novela.ts` | `Novela`, `Capitulo`, `EquivalenciaManhwa`, `UserProgress`. |
| `src/lib/mockData.ts` | Catálogo de respaldo. Solo se usa si `obras` está vacía o no hay credenciales. |
| `scripts/plataformas.mjs` | **Adaptadores de sitio.** `madara`, `mangareader`, `mangadex`, `asura`, `css`… Lo único que hay que tocar cuando una scan cambia su HTML. |
| `scripts/descubrir.mjs` | Recorre el catálogo de cada sitio y crea sus obras y fuentes. Trae `--probar`. |
| `scripts/detectar.mjs` | De un dominio suelto a una fila de `sitios` lista para pegar. No escribe en la BD. |
| `src/pages/admin.astro` | Panel de administración. Página estática; quien manda es RLS. |
| `src/lib/api.ts` | **Única puerta a los datos.** Todo async: cambiar mock → Supabase no toca ninguna página. |
| `src/lib/equivalencia.ts` | Conversión capítulo de manhwa → capítulo de novela (interpola entre anclas). |
| `src/lib/supabaseClient.ts` | Cliente + login con Google. **Incluye el paso a paso de OAuth en comentarios.** |
| `src/lib/progress.ts` | Progreso: siempre localStorage, además Supabase si hay sesión. |
| `src/components/ReadTrackerButton.astro` | Check animado estilo Things 3. Mismo botón para invitado y logueado. |
| `src/components/ManhwaToNovelBridge.astro` | «¿Vienes del manhwa?» → capítulo exacto de la novela. |
| `src/components/SyncExplanationBanner.astro` | Explica local vs nube. Se cierra o desaparece al iniciar sesión. |
| `supabase/schema.sql` | Tabla `progreso` + RLS. Pegar en el SQL Editor. |
| `supabase/schema-catalogo.sql` | `obras`, `sitios`, `admins` y las políticas de escritura. Idempotente. |
| `public/_headers` | `CDN-Cache-Control: s-maxage=86400, stale-while-revalidate` en el edge. |

## El agregador: de un sitio a un catálogo

El sitio no aloja capítulos. Indexa **dónde** están y enlaza a la fuente original.
Nunca se descarga el texto de una novela ni las páginas de un manhwa: solo
título, número, fecha y enlace. Eso es lo que separa a un índice de una copia.

```
sitios ──descubrir.mjs──▶ obras + fuentes ──scrapear.mjs──▶ capitulos_externos
  │                          │                                    │
un INSERT              una obra por serie                  metadata + enlace
por sitio              una fuente por serie                 al sitio de origen
```

**Añadir un sitio entero son dos pasos.** Primero se comprueba sin escribir nada:

```bash
node scripts/descubrir.mjs --probar='https://sitio.com/manga/page/{page}/' --plataforma=madara
```

Imprime las series que encuentra y los capítulos de la primera. Si sale la lista,
el sitio se añade desde `/admin` o con un INSERT (ver `supabase/seed-sitios.sql`)
y esa noche entra solo.

### Las plataformas

| `plataforma` | Cuándo | Qué hace falta |
|---|---|---|
| `mangadex` | **La fuente principal.** API pública, catálogo enorme, feed por idioma. | Solo la URL del endpoint. |
| `madara` | El tema de WordPress más común en scans. Capítulos por AJAX. | Solo la URL del listado. |
| `mangareader` | El otro tema grande (leemiau, legionscans…). | Solo la URL del listado. |
| `asura` | Asura Scans. La web es React, pero su backend `api.asurascans.com` es JSON público con índice de capítulos y metadata. | Solo la URL del endpoint. |
| `css` | Sitios sueltos con HTML propio. | Los selectores, en la fila de `sitios`. |

Un sitio nuevo de las cuatro primeras familias es **una URL**: sin selectores, sin
deploy. Cuando una scan rediseña su HTML se arregla en `plataformas.mjs` y
quedan arreglados todos los sitios de esa familia a la vez.

**MangaDex es la que carga el catálogo.** Una fila por idioma y la misma obra
aparece con su cuenta real en cada uno — medido: *Eleceed* tiene 8 capítulos en
español, 103 en inglés y 293 en portugués. Trae además títulos alternativos,
estado y géneros ya rellenos, y su `robots.txt` solo prohíbe `/at-home/`, que es
el servidor de imágenes y aquí no se toca.

Su `slug` sale **siempre del título en inglés**, nunca del localizado. Sin eso,
las filas es/en/pt crearían tres obras distintas de la misma historia («Lector
omnisciente», «Omniscient Reader's Viewpoint»…) y se perdería la comparación
entre idiomas, que es todo el producto.

### Qué sitios NO se pueden indexar

Buena parte del sector se ha pasado a SPAs: el HTML que llega es un cascarón
vacío y el catálogo lo pinta JavaScript después. Comprobado con `detectar.mjs`:

| Sitio | Qué es |
|---|---|
| libribar.com | 474 bytes de cascarón JS |
| lectortmoo.com | Nuxt |

Para esos no sirve ningún selector ni hay API que pedir: harían falta un
navegador headless. `node scripts/detectar.mjs dominio.com` distingue los casos
en segundos.

**Pero una SPA con API pública sí se indexa, y sale mejor que raspar HTML.** Por
ahí entraron manhwaweb, olympus y asurascans (`asura`): vienen con portada,
estado y géneros ya rellenos y sin un selector que se rompa. Antes de dar un
sitio por imposible, mira qué pide su pestaña de red.

### Emparejar la misma obra entre idiomas

Olympus publica *El Lancero Genio Inmortal*, las fichas guardan *El genio
lancero inmortal* y DaoTranslate *The Immortal Genius Spearman*. Las dos
primeras casan porque `emparejar.mjs` indexa el título también con las palabras
**ordenadas** (desde 3 palabras; con 2 el orden sí distingue obras de verdad).

Eso es lo que destraba la cadena: con ese match `enriquecer.mjs` acepta la ficha
de MangaBaka y se trae sus títulos en inglés y coreano, y con el inglés ya
guardado la novela de DaoTranslate cae en el mismo manhwa en vez de abrir una
ficha aparte. `enriquecer.mjs --reintentar` repasa las que en su día quedaron
sin ficha; el workflow nocturno lo corre solo.

> ⚠ Usa el dominio real, no el de marca. `samuraiscan.com/son/page/2/` redirige
> a su host actual **pero se come la ruta** y acaba en la portada: el descubridor
> no encontraría nada y el fallo sería mudo. `--probar` lo detecta en 5 segundos.

### Enlaces que caducan

Olympus le pega **la fecha de hoy** al slug de cada serie
(`/series/comic-la-historia-…-20260829-110503838`) y los regenera cada mañana
sobre las 11:05 UTC. El enlace de anteayer no redirige: devuelve un 500. No hay
URL estable que guardar, así que `.github/workflows/refrescar.yml` vuelve a leer
su catálogo **dos veces al día** —09:00 y 15:00 de Perú— y reescribe las URLs.

Dos detalles hacen que eso de verdad arregle la ficha y no solo la BD:

- `scrapear.mjs` **borra el enlace viejo** de las fuentes link-out. El upsert va
  por `(fuente_id, url)`: sin ese borrado, la URL nueva entraba como fila nueva
  y la rota se quedaba enseñándose al lector.
- Asura tiene el mismo vicio (un hash al final de `/comics/<slug>-b57aa235`),
  pero ahí **el sitio redirige**: se enlaza `/comics/<slug>` a secas y no caduca.
  Cuando una fuente ofrece las dos formas, siempre la que redirige.

### Varias versiones de la misma obra

Cada fuente lleva su `tipo` (manhwa/novela) y su `idioma`. La misma obra puede
tener el manhwa en español por el capítulo 173 y la novela en inglés por el 1948,
y la ficha las muestra como pestañas **ordenadas por la más adelantada**.

Ese orden es el producto: el lector llega buscando el capítulo 174 en español,
que todavía no existe, y ve que la novela en inglés ya va por el 1948.

### El panel de administración

`/admin` es una página estática que habla con Supabase desde el navegador. No hay
servidor ni una segunda app. Lo que impide que cualquiera edite el catálogo no es
la página, **es RLS**: solo los correos de la tabla `admins` pueden escribir.

```sql
insert into public.admins values ('joseluisariasflores01@gmail.com');
```

Desde ahí se cambia la portada de una obra (con vista previa antes de guardar),
su título, sus títulos alternativos, categorías y estado; se publica o se oculta;
se activan o desactivan fuentes; y se añaden sitios nuevos.

Las portadas que trae el descubridor apuntan al sitio de origen. Sustituirlas por
una copia propia es justo para lo que está el campo.

> La **sinopsis se deja vacía a propósito** al descubrir. Una sinopsis copiada de
> otro sitio y auto-traducida a 7 idiomas es exactamente el contenido duplicado
> que hunde un sitio multiidioma. Se escribe a mano y entonces sí se traduce.

## Idiomas

**La base de datos guarda un solo idioma.** Las demás versiones se traducen en el *build*, no en la BD ni en el navegador:

```
Supabase (1 idioma) ──▶ npm run traducir ──▶ traducciones.json ──▶ astro build
                              │                     │                   │
                        DeepL, incremental    caché versionado   HTML /en/ /pt/ /id/…
```

Por qué así y no de las otras dos formas:

| | ¿Dónde vive la traducción? | ¿Googlebot la ve? | ¿Rankeas en ese idioma? |
|---|---|---|---|
| En el navegador | en ningún lado | no | **no** |
| **En el build** | **caché de archivo** | **sí** | **sí** |
| En la BD | columnas por idioma | sí | sí, pero la BD se desincroniza |

El caché va por **hash del texto origen**: corriges una frase en español, cambia su hash, se retraduce sola y lo demás no se re-paga. Un capítulo nuevo son ~12.000 caracteres, no los 480 otra vez.

```bash
npm run traducir              # qué falta, sin gastar (dry-run)
npm run traducir -- --aplicar # traduce y guarda
```

### Qué idiomas hay y por qué

Elegidos por **volumen de búsqueda × CPM** en este nicho concreto:

| | Idioma | Por qué |
|---|---|---|
| `en` | English | Volumen altísimo + el CPM más alto. El idioma que paga las facturas. |
| `pt` | Português | Brasil es de los mayores fandoms de manhwa del mundo. CPM medio. |
| `es` | Español | Base del sitio. LatAm + España: volumen alto, CPM medio-bajo. |
| `id` | Indonesia | Lidera lectura de webtoon/manhwa. CPM bajo, volumen brutal. |
| `fr` | Français | Mejor equilibrio de Europa: CPM alto, cultura de scanlation fuerte. |
| `de` | Deutsch | El CPM más alto de la lista. Público menor pero muy rentable. |
| `vi` | Tiếng Việt | Volumen enorme en novela ligera. Tráfico barato de captar. |

Fuera a propósito: **`ru`** (AdSense no monetiza tráfico ruso desde 2022 — volumen sí, dinero no), **`ar`** (hay que revisar el layout RTL antes; el campo `dir` ya está listo), **`ko`/`ja`** (es el idioma de la obra original: ese lector no busca una traducción).

### La compuerta de publicación

Estar en `IDIOMAS` solo declara la intención. [`src/lib/publicables.ts`](src/lib/publicables.ts) solo deja salir un idioma cuando su contenido supera el **95 % traducido**. Por debajo de eso, sus rutas no se generan, su `hreflang` no se anuncia y no aparece en el selector.

Sin esa compuerta, añadir `fr` generaría 487 páginas francesas con el texto en español: contenido duplicado, exactamente lo que hunde un sitio multiidioma.

**Añadir un idioma** son 3 pasos:

1. Una entrada en `IDIOMAS` de [`src/lib/i18n.ts`](src/lib/i18n.ts): `tr: { nombre, htmlLang, ogLocale, dir }`.
2. Un diccionario `tr: Diccionario` en el mismo archivo — TypeScript marca en rojo cada clave que falte.
3. `npm run traducir -- --idioma=tr --aplicar`.

Al superar el umbral, aparece solo: rutas, `hreflang`, sitemap y selector.

Las rutas salen solas: `src/pages/[...idioma]/` hace que **un archivo por página** cubra los N idiomas. También el `hreflang`, el sitemap y el selector.

Si un texto aún no está traducido, `src/lib/api.ts` devuelve el original en vez de romper.

> ⚠️ Traducción automática **sin revisar** es spam para Google. Revisa al menos títulos, sinopsis y los primeros capítulos de cada idioma antes de publicarlo. Un idioma a medio traducir hace más daño que no tenerlo.

> ⚠️ Nunca redirijas por IP al idioma del visitante. Googlebot rastrea desde EE. UU.: si rediriges, solo verá una versión y no indexará las demás. Sirve URLs separadas + `hreflang` y, como mucho, *sugiere* el cambio (es lo que hace `Translate.astro`).

## Progreso de lectura

- **Invitado:** `localStorage`, cero costo, cero registro.
- **Con Google:** al iniciar sesión se **unen** local y nube (nunca se pierde lo leído en el celular) y a partir de ahí cada check sube a Supabase.

Sin variables de Supabase el sitio compila y funciona igual, en modo invitado. Se puede desplegar antes de tener cuenta.

## Desplegar en Cloudflare Pages

1. Sube el repo a GitHub → Cloudflare Pages → *Connect to Git*.
2. Build command `npm run build`, output `dist`.
3. Variables de entorno: `SITE_URL`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.
4. Apunta el dominio y actualiza el `Sitemap:` de `public/robots.txt`.

## Poner en marcha el catálogo

En el SQL Editor de Supabase, en este orden:

```
schema.sql  →  schema-fuentes.sql  →  schema-catalogo.sql  →  seed-sitios.sql
```

Después, una vez:

```sql
insert into public.admins values ('joseluisariasflores01@gmail.com');
```

Y ya en local, para ver qué haría antes de tocar la BD:

```bash
npm run descubrir -- --seco      # cuántas obras saldrían de cada sitio
npm run descubrir                # las crea
npm run scrapear                 # indexa sus capítulos
```

`api.ts` lee `obras` de Supabase y cae a `mockData.ts` si la tabla está vacía o
no hay credenciales. Por eso `npm run dev` funciona en un repo recién clonado.

## Checks

```bash
npm run test:scrapear                              # adaptadores, sin red
node --experimental-strip-types src/lib/api.test.ts
```

`test:scrapear` sustituye `fetch` por HTML fijo: comprueba los dos adaptadores,
la numeración, el slug y que se respete `robots.txt`, sin depender de que los
sitios de origen estén arriba hoy.

---

Portadas en `public/portadas/` son placeholders SVG generados. Las obras
descubiertas traen la portada del sitio de origen; sustituirlas por una copia
propia desde `/admin` es lo recomendable.
