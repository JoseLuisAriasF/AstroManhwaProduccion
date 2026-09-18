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
| `src/lib/brecha.ts` | Cuánto le lleva la novela al manhwa. El número por el que llega la gente; se calcula UNA vez y lo usan la ficha, /equivalencia y /rankings. |
| `src/lib/fuentes.ts` | Qué dominios puede pedir el visor. La puerta que evita un proxy abierto. |
| `functions/leer.ts` | **El capítulo, servido dentro del sitio.** Sin guardar nada. |
| `src/lib/capitulos.ts` | Qué aporta el título que trajo la scan por encima de «Capítulo N». |
| `functions/novela/[slug]/[capitulo].ts` | **Una página por capítulo, armada en el edge.** Sin generar archivos. |
| `src/lib/sitemapCapitulos.ts` | Las ~200.000 URLs de capítulo, troceadas en sitemaps de 45.000. |
| `src/lib/soloEnlace.ts` | Qué fuentes no listan capítulos. Lo leen el sitemap y el edge, del mismo archivo. |
| `src/lib/indexacion.ts` | **Qué se indexa**: niveles A/B/C y el filtro adulto. Ver «Qué se le ofrece a Google». |
| `src/lib/seo.ts` | BreadcrumbList y FAQPage. Los datos estructurados que se repiten en varias páginas. |
| `scripts/indexnow.mjs` | Avisa a Bing/Yandex/Naver/Seznam de lo que cambió: fichas **y capítulos nuevos**. |
| `scripts/palabras.mjs` | Qué escribe la gente de verdad, del autocompletado de Google. Herramienta de escritorio. |
| `scripts/pinterest.mjs` | El catálogo → CSV para la creación masiva de Pinterest. Herramienta de escritorio. |
| `public/_headers` | `CDN-Cache-Control: s-maxage=86400, stale-while-revalidate` en el edge. |
| `public/_routes.json` | Qué rutas invocan una función. Sin él, cada CSS gastaba una invocación. |
| `functions/portada/[slug].ts` | **Las portadas, servidas desde nuestro dominio.** Proxy en el edge, sin guardar nada. |
| `src/pages/portadas.json.ts` | El mapa slug → URLs de origen que consulta ese proxy. |

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
| `madara` | El tema de WordPress más común en scans. Capítulos por AJAX. Cubre también sus temas **hijos**, que reescriben la rejilla a `a.acard` (imperiomanhua). | Solo la URL del listado. |
| `mangareader` | El otro tema grande (leemiau, legionscans…). | Solo la URL del listado. |
| `asura` | Asura Scans. La web es React, pero su backend `api.asurascans.com` es JSON público con índice de capítulos y metadata. | Solo la URL del endpoint. |
| `mgeko` | MangaGeko, manhwa en inglés. El catálogo es un JSON con las tarjetas en HTML. | Solo la URL del endpoint. |
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

Una fuente en inglés contra fichas que solo conocen el español (*Children of
the Rune* / *Hijos de la runa*) no comparte ni una clave. `descubrir.mjs
--traducir` pasa los títulos que no casaron por el traductor local
(`traductor/`) y los vuelve a buscar en español. La traducción solo sirve para
buscar, nunca se guarda como título. Lo que casó así queda atado por la URL de
su fuente, así que el workflow nocturno —sin traductor— no lo vuelve a crear.

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
insert into public.admins values ('test@gmail.com');
```

Desde ahí se cambia la portada de una obra (con vista previa antes de guardar),
su título, sus títulos alternativos, categorías y estado; se publica o se oculta;
se activan o desactivan fuentes; y se añaden sitios nuevos.

Las portadas que trae el descubridor apuntan al sitio de origen. Sustituirlas por
una copia propia es justo para lo que está el campo.

> La **sinopsis se deja vacía a propósito** al descubrir. Una sinopsis copiada de
> otro sitio y auto-traducida a 7 idiomas es exactamente el contenido duplicado
> que hunde un sitio multiidioma. Se escribe a mano y entonces sí se traduce.

### ⚠ Cómo se lee una tabla grande, y por qué así

Dos trampas, las dos silenciosas, medidas sobre `capitulos_externos`
(264.832 filas):

**1. Sin un orden TOTAL se pierden filas.** `range()` es `OFFSET/LIMIT`, y
Postgres solo garantiza qué filas caen en cada página si el `ORDER BY` las
desempata a todas. `order('numero')` no lo hace —miles de obras comparten el
capítulo 1— y las empatadas salen en distinto orden en cada página: unas se
repiten y otras no se leen nunca.

| Orden de la consulta | Filas distintas leídas | Perdidas |
|---|---|---|
| sin `ORDER BY` | 168.659 | **96.173 (36 %)** |
| `order(numero desc)` ← lo que había | 264.812 | 20 |
| `order(id)` | 264.832 | ninguna |

**2. El `OFFSET` profundo es cuadrático.** La página 265 obliga a recorrer y
tirar 264.000 filas antes de devolver 1.000. Con `numero desc` encima —que no
tiene índice propio, así que hay que ordenar la tabla entera cada vez— la capa
gratis de Supabase corta con `statement timeout`. Medido en el mismo momento y
sobre el mismo offset 0:

```
order(numero desc, id)  →  canceling statement due to statement timeout
order(id)               →  1.000 filas
```

Así que `todasLasFilas` pagina **por la clave**: `where clave > última order by
clave limit 1000`. Recorre el índice primario y cada página cuesta lo mismo, sea
la primera o la 265. El orden que necesite la vista se pone en memoria —ordenar
264.000 filas una vez en JS son milisegundos— y por eso `catalogo()` ordena sus
destacadas y `cargarExternos()` sus capítulos después de leer, no antes.

> `equivalencias` es la excepción y va por `OFFSET`: su clave es compuesta
> (`novela_slug`, `capitulo_manhwa`) y avanzar con `> novela_slug` se saltaría
> el resto de anclas de esa obra en cuanto una cruzara el corte de página. Es
> una tabla pequeña, y con el orden total de su clave primaria el `OFFSET` sí
> es correcto.

El fallo de las dos es **mudo**: el build no avisa, solo publica el sitio con
capítulos de menos. Se vio al cuadrar el sitemap de capítulos, porque dos
conteos de lo mismo daban 152.845 y 199.850.

## SEO: qué se hace y por qué

El sitio ya nacía con sitemap, hreflang, canonical y JSON-LD de `Book`/`Chapter`.
Lo que se añadió encima es lo que un agregador puede hacer y una scan no.

### Páginas que solo existen aquí

| Ruta | Qué responde | Por qué gana |
|---|---|---|
| `/novela/<slug>/equivalencia` | «¿Por qué capítulo de la novela sigo?» | Es LA consulta que trae al lector, y el dato sale de cruzar manhwa y novela: ninguna scan ni base de fichas lo tiene. Con `FAQPage` (las preguntas están escritas y visibles, no solo en el marcado). |
| `/rankings` | Dónde queda más historia sin dibujar | Listas ordenadas que se enlazan y se comparten; a una ficha suelta no se enlaza. Salen de un cálculo, no de escribir. |
| `/novedades` + `/rss.xml` | Qué se movió hoy | Frescura, que es la mitad de la vida de un agregador. El RSS abre además una puerta que no depende de Google. |
| `/titulos/<letra>` | La misma obra con sus otros nombres | Convierte los ~8 títulos alternativos de cada obra en enlaces internos con el nombre como texto: «화산귀환» apuntando a la ficha le dice al buscador, en coreano, de qué va. |

Las cuatro se enlazan desde la portada y el pie **a propósito**: una página nueva
que solo cuelga del sitemap tarda meses en despegar.

### Qué se le ofrece a Google: niveles A, B y C

Search Console (sept. 2026): 347 indexadas, **9.442 «Descubierta: actualmente
sin indexar»** y ~220 rastreos al día. Con 10.000 fichas y 270.000 capítulos,
Google no llega, y con tanta página delgada desconfía del resto. Ahora elegimos
nosotros (`src/lib/indexacion.ts`):

| Nivel | Qué obras | Qué se indexa |
|---|---|---|
| **A** | manhwa **y** novela | Ficha, `/equivalencia` y páginas de capítulo |
| **B** | un formato, con 5+ capítulos **o** con tráfico en GSC | Solo la ficha; sus capítulos, `noindex` |
| **C** | el resto, y lo adulto sin tráfico | Nada: `noindex, follow` y fuera del sitemap. La página sigue sirviendo. |

- **No «solo A».** Medido: las 9 fichas con más clics son de un solo formato y suman más de la mitad del tráfico.
- **`src/lib/con-trafico.json`** rescata fichas que Google ya enseña. Se actualiza con `npm run trafico -- Páginas.csv` (GSC → Rendimiento → 3 meses → Exportar).
- **Un solo mapa decide todo** (`niveles()` en `catalogo.ts`): el `noindex` de la página, `/sitemap-obras.xml`, los sitemaps de capítulo y `/obras-nivel-a.json`, que lee la función del edge. Una URL no puede estar en el sitemap y con noindex.
- **Adulto** (`adult`, `hentai`, `smut`, `erotica` o «Uncensored» en el título): nivel C salvo que tenga tráfico (entonces B, decisión consciente: la obra con más clics es Adult/Smut). Sin hub de categoría y fuera de «similares». ⚠ Esas fichas no deben llevar anuncios. **`lolicon`/`shotacon` no se publican.**
- **404 con arreglo → 301** (`functions/_middleware.ts`): `/pt/`, `/fr/`, `/de/`… a la página en español, y `/novela/x-capitulo-86` a `/novela/x/capitulo-86`.
- **`ruta()` pone la barra final**: cada enlace interno sin ella era un 308.

### Español e inglés en las obras A

| Qué | Dónde | Por qué |
|---|---|---|
| **El nombre inglés de verdad** | `src/lib/titulos.ts` | El segundo nombre del `<title>`/`<h1>` era `titulosAlternativos[0]`: pinyin («Bie Zai Zhaohuan Wo La!») o coreano romanizado. Ahora se detecta el idioma de cada título; en `/en/` el principal es el inglés. **Los títulos nunca se traducen por máquina.** |
| **Géneros canónicos** | `src/lib/generos.ts` | «Action», «action» y «Acción» eran tres etiquetas y dos hubs. Ahora una: `/categoria/accion/` (los slugs viejos → 301 en el middleware), «Action» en `/en/`. |
| **Sinopsis en su idioma** | `api.ts` → `localizarNovela` | La ficha española enseñaba la sinopsis inglesa aunque el caché tuviera la española. Se localiza una vez por idioma. |
| **`/en/` de ficha y de equivalencia** | `idiomasDeObra` + `textosObra.ts` | Una obra existe en inglés si su sinopsis está traducida **o ya venía en inglés**. Title, descripción, brecha y FAQ con datos, en los dos idiomas. |
| **Portadas y sinopsis que faltan** | `npm run enriquecer -- --nivel-a` | Rellena desde AniList/MangaUpdates/MAL las obras A sin sinopsis o con portada en un host muerto (imageshack, mangadex). |

Traducir las sinopsis de las obras A (NLLB local, ~2 h en CPU):

```bash
TRADUCIR_LOTE=1 npm run traducir -- --nivel-a --aplicar
```

En CPU, lotes de más de 1 sinopsis superan el timeout de `fetch` y se reintentan desde cero.

### Buscar un capítulo suelto

«regreso de la secta del monte hua cap 1200», «… manhwa 1200», «… novel 1200».
Es la consulta más repetida del nicho y la página no la respondía, por dos
motivos tontos:

- **La lista pintaba el número a secas.** Un `1200` suelto no es la frase
  «capítulo 1200»: la etiqueta la ponía la scan, cuando la ponía, y en su
  idioma. Ahora la escribe el sitio (`dic.capNumero`, un idioma por
  diccionario) y del título que trajo la scan se queda solo lo que **añade**
  (`src/lib/capitulos.ts`). Medido sobre 1.000 capítulos reales: el 82 % de esos
  títulos era el número otra vez, así que además se acabó el «1200 · Capítulo
  1200» que se leía antes.
- **El `<title>` no mencionaba ningún capítulo.** Ahora lleva el último de cada
  formato: `Sistema devorador definitivo / Ultimate Devouring System — manhwa
  cap. 45 · novela cap. 5072`. En una frase van el nombre en español, el nombre
  en inglés, las palabras «manhwa» y «novela» y los dos números, y se actualiza
  solo con el scrapeo de cada noche.

Un `<title>` cubre el capítulo **último**, que es donde está el grueso de la
búsqueda; los demás números viven en la lista de la ficha, ya como «Capítulo N».

> Antes esto no existía y el `<title>` era todo lo que había. Se hizo cuando
> quedó claro que el capítulo suelto es la consulta con más volumen del nicho.

### Una página por capítulo, sin generar 200.000 archivos

Quien busca «monte hua cap 1200» quiere una página que se llame como su
búsqueda, no la ficha de la obra. Son ~200.000 URLs y **no se pueden generar**:
Cloudflare Pages admite 20.000 archivos por despliegue y el sitio ya usa la
mitad. Así que no se generan.

```
/novela/<slug>/capitulo-1200
        │
   functions/novela/[slug]/[capitulo].ts   ← arma el HTML en la primera visita
        │
   4 consultas a PostgREST ──▶ caché del edge (1 día) ──▶ las siguientes
                                                          ni ejecutan la función
```

Es el mismo truco que las portadas: **cero archivos, cero almacenamiento**, y el
coste se queda en cero porque la segunda petición sale de la caché.

**Los capítulos son los que hay, no los que cuadran.** Una página existe solo si
alguna fuente tiene ESA fila. Y las fuentes **link-out** quedan fuera: Olympus y
su clase guardan una sola fila con el total en `numero` y la URL de la serie —
`{ numero: 18, titulo: 'Serie completa · 18 capítulos', url: '/series/…' }`—, así
que ese 18 no es un capítulo al que enlazar. Se excluyen de todas las consultas:
también de anterior/siguiente, porque colarlo ahí dejaría un «Capítulo 18 →»
apuntando a un 404. Son 4.136 fuentes, no es un caso raro.

Quién es link-out se decide **en un solo sitio**: `src/lib/soloEnlace.ts` lo
calcula en el build con el mismo código que la ficha (`fuentesDe().soloEnlace`)
y lo publica en `/fuentes-enlace.json`; el sitemap y la función del edge leen esa
lista. No pueden discrepar por construcción.

> El primer intento sí discrepaba. La función usaba `fuentes.n_caps` porque
> parecía la misma señal, y no lo es: `n_caps` es lo que encontró el ÚLTIMO
> scrapeo, no lo que hay guardado. Medido: 3.710 fuentes lo tienen a `<= 1` y sí
> listan capítulos, y con esa regla **14.638 URLs del sitemap devolvían 404**.
> Es el patrón de `/portadas.json`: si dos sitios tienen que estar de acuerdo,
> que lean el mismo archivo.

**No son páginas calcadas**, que es lo que Google castiga. Cada una lleva lo que
solo se sabe de ESE capítulo:

- qué fuentes lo tienen —no todas llegan al 1200— con su tipo, idioma y enlace;
- por qué capítulo de la novela va la historia en ese punto, interpolando las
  anclas con la **misma** fórmula que el resto del sitio (`src/lib/equivalencia.ts`
  se importa, no se copia: por eso su `import type` es relativo y no `@/`);
- el anterior y el siguiente, que además es el camino por donde se rastrea.

Un capítulo que no existe devuelve **404**, no un 200 vacío. A esta escala los
soft-404 son la forma más rápida de que el dominio entero pierda confianza.

```bash
npm run test:capitulo   # /equivalencia sigue de largo, el 404, prev/next, la equivalencia y el caso link-out
```

**No se guarda nada nuevo.** Cero tablas, cero columnas, cero filas añadidas:
todo sale de lo que `scrapear.mjs` ya escribe. `capitulos_externos` pesa hoy
~63 MB de datos (267.558 filas × ~248 B) sobre los 500 MB del plan gratis de
Supabase, y esas filas no son un coste de este SEO —son las que guardan el
enlace a cada capítulo, que es el producto—. Las 9.336 fuentes link-out ya
guardan solo el total, que es exactamente lo que pesa poco.

**Cómo las encuentra Google.** Dos caminos, porque uno solo no basta:

| | |
|---|---|
| `sitemap-capitulos-N.xml` | Un sitemap sí cabe: es texto, no archivos. ~200.000 URLs en cinco XML de 45.000 (el tope del formato son 50.000). Van anunciados en `robots.txt` con su propia línea `Sitemap:`, **aparte** del índice principal: así en Search Console se ve por separado cuánto de esto se indexa, que es el número que decide si el experimento sigue o se recorta. |
| «¿Buscas un capítulo suelto?» | Seis enlaces en cada ficha, a los seis capítulos más recientes. Son la ENTRADA a la cadena: desde ahí, prev/next recorre la obra entera. Una URL que solo cuelga del sitemap se rastrea tarde y mal. |
| `/novedades` | Cada obra con capítulo nuevo enseña «Capítulo N →» apuntando a su página. Es la página más fresca del sitio y la que más se rastrea, así que el capítulo de hoy entra al índice días antes que por el sitemap. Y para quien lee es el atajo obvio: viene a por el capítulo nuevo, no a por la ficha. |
| IndexNow | Los capítulos nuevos, uno a uno, la misma noche. Google no participa, pero Bing, Yandex, Naver y Seznam sí. |

### `_routes.json`: que los assets no gasten invocaciones

El plan gratis de Cloudflare da **100.000 invocaciones de función al día**, y
tener un `_middleware.ts` en la raíz hacía que pasara por ahí *todo*: cada CSS,
cada JS, cada icono. Una visita a una ficha son ~6 peticiones y 6 invocaciones,
de las cuales una sola necesitaba una función. Con Googlebot recorriendo
200.000 URLs de capítulo eso es lo primero que se agota.

`public/_routes.json` deja fuera lo que es un archivo y nada más: `/_astro/*`,
los iconos, el `robots.txt`, los sitemaps, el RSS. Lo que **sí** sigue dentro es
`/portada/*` —que es una función, no una carpeta; ojo con `/portadas/*`, que sí
es carpeta— y todo lo demás.

> Las reglas de `_routes.json` solo admiten comodín **al final**, así que
> `/sitemap-*.xml` no vale y los sitemaps van uno por uno. Si algún día hacen
> falta más de los que están listados, el de más no se rompe: solo pasa por la
> función y gasta una invocación.

> ⚠ **Lo que hay que vigilar igual.** Si Googlebot se pone a recorrer las
> 200.000 URLs de golpe, la cuenta se mira en el panel de Cloudflare. Si
> aprieta: recortar el sitemap a los últimos N capítulos de cada obra (una línea
> en `src/lib/sitemapCapitulos.ts`).

### Buscar por el otro nombre

La misma obra se busca como «Regreso de la Secta del Monte Hua», «Return of the
Mount Hua Sect» y «화산귀환». El andamiaje ya está y son tres cosas distintas:

| Dónde | Qué aporta |
|---|---|
| `<title>` y `<h1>` de la ficha | El nombre en inglés, que es la consulta más común fuera de Latinoamérica. |
| Texto visible «también conocida como» | Los ~8 nombres, **siempre** en el HTML (el recorte a 2 líneas es solo visual). |
| `alternateName` del JSON-LD (`ComicSeries`/`BookSeries`) | Le dice a Google que los nombres son de la misma entidad. |
| `/titulos/<letra>` | Cada nombre como **enlace interno** con el nombre de texto: «화산귀환» apuntando a la ficha le dice al buscador, en coreano, de qué va. |

Lo que falta ahí no es marcado, es que Google llegue: por eso IndexNow, el
sitemap de imagen y Pinterest.

### La brecha

`src/lib/brecha.ts` calcula lo mismo para todos: último capítulo del manhwa,
último de la novela, y la resta. Aparece en tres sitios y por eso vive en uno:

- en la **descripción** de la ficha (en español), porque un número concreto gana
  a cualquier adjetivo y la descripción es lo que decide el clic;
- en un **bloque visible** arriba de la ficha —«te faltan 1.775 capítulos»—, que
  es un bucle abierto y no un anuncio;
- ordenada, en `/rankings`.

### Avisar en vez de esperar

```bash
npm run avisar          # las obras con capítulo nuevo en 24 h
npm run avisar -- --seco
```

Un POST a IndexNow y Bing, Yandex, Naver y Seznam saben qué URLs tocar. Gratis,
sin cuenta y sin cuota real; la prueba de dominio es que se sirva
`public/<clave>.txt` (si se cambia la clave hay que cambiar las dos cosas). Los
dos workflows lo corren después del deploy.

Van las fichas que cambiaron **y cada capítulo nuevo, uno a uno**: cada uno
tiene su página (ver más abajo) y es la URL con más intención de búsqueda que
produce el sitio —alguien escribe «\<obra\> cap 1200» el mismo día que sale—.
Medido en una ventana de 48 h: 539 obras y **2.954 capítulos**. Las fuentes
link-out quedan fuera, que su fila no es un capítulo.

**Google no participa en IndexNow** y su Indexing API es solo para ofertas de
empleo y directos. Ahí no hay atajo: sitemap y enlaces internos, que es lo que
se reforzó arriba.

### Saber qué escribe la gente

```bash
npm run palabras -- --titulo="Regreso de la Secta del Monte Hua"
npm run palabras -- --top=25 --idiomas=es,en,pt
```

El autocompletado de Google es público y gratis: devuelve consultas que existen
de verdad, por idioma y país, no volumen estimado. Sirve para saber cuál de los
títulos alternativos se busca y con qué cola («… novela», «… 153»), que es lo
que debe ir en el `<title>` y el `h1`.

### Las portadas, en nuestro dominio

Cada `<img>` apuntaba al sitio de origen. Eso regalaba tres cosas:

- **Google Imágenes** indexaba la portada bajo el dominio de la scan. En este
  nicho se busca por portada, y ese tráfico se lo llevaba entero otro sitio.
- El `og:image` era de un tercero: varias redes descartan la vista previa.
- Cuando la scan borra la imagen, la ficha enseña un ícono roto. El respaldo por
  JS (`data-fb`) lo tapa para la persona, pero **un rastreador no ejecuta JS**:
  para Google la portada seguía rota.

```
<img src="/portada/<slug>.jpg">
        |
   functions/portada/[slug].ts --lee--> /portadas.json (slug -> URLs de origen)
        |                                     generado en el build
   fetch al origen --> caché de Cloudflare --> las siguientes visitas
                                               ni ejecutan la función
```

**No se copia ninguna imagen, y es a propósito.** Todo almacenamiento gratis
tiene tope (Supabase Storage: 1 GB; R2: 10 GB) y 8.600 portadas lo van comiendo
sin parar hasta que un día hay que pagar. La caché del edge, en cambio, es gratis
y sin límite: la primera petición trae la imagen del origen y las demás salen del
edge. El coste se queda en cero para siempre.

La lista de destinos es **cerrada**: solo se proxea lo que está en
`/portadas.json`. Llevar la URL en la ruta habría convertido el dominio en un
proxy abierto que cualquiera podría usar para pedir lo que quisiera.

El proxy además **prueba las fuentes en orden** y descarta lo que llega con 200
pero no es una imagen (el cartel de «no hotlinking» de algunas scans). Si ninguna
sirve, devuelve el placeholder: nunca un ícono roto, tampoco para Googlebot.

```bash
npm run test:portada    # los 4 casos del proxy, sin red
```

> En `npm run dev` no hay funciones de Cloudflare, así que ahí `portadaUrl` sigue
> siendo la URL de origen. El cambio vive en `src/lib/api.ts`, que es por donde
> pasan las ~12 plantillas que pintan una portada.

### Que Google Imágenes las encuentre

Servir la portada desde nuestro dominio no basta: en la ficha vive dentro de una
tarjeta y en las listas es una miniatura entre veinte. Un rastreador no ejecuta
JS, y en un dominio nuevo el presupuesto de rastreo no llega a todas. Por eso el
sitemap **declara la imagen de cada ficha**:

```xml
<url>
  <loc>https://…/novela/regreso-de-la-secta-del-monte-hua</loc>
  <image:image><image:loc>https://…/portada/regreso-….jpg</image:loc></image:image>
</url>
```

Sale de `serialize` en `astro.config.ts`, y solo para las obras cuya portada
existe de verdad (el `portada_vista` de alguna fuente, que `sitemapMeta.ts` ya
trae en la misma consulta que el `lastmod`). Declarar 8.600 imágenes cuando
2.000 son el placeholder es pedirle a Google que rastree el mismo SVG dos mil
veces.

> `img` no está en el tipo de `@astrojs/sitemap` (recorta a url, lastmod,
> changefreq, priority y links), pero el objeto pasa entero al paquete `sitemap`,
> que sí lo entiende, y el namespace de imagen ya viene activado. De ahí el cast.

### Pinterest: el catálogo convertido en pines

Es el único canal donde una publicación sigue trayendo visitas meses después, y
este nicho se busca **por portada**. Las dos piezas que hacen falta ya existían:
la portada en 2:3 servida desde nuestro dominio —justo el formato que Pinterest
quiere— y la brecha, que es un titular y no un adjetivo.

```bash
npm run pinterest -- --seco            # qué saldría, sin escribir nada
npm run pinterest                      # 1 archivo, 200 pines
npm run pinterest -- --lotes=3 --por-dia=10
```

Escribe en `pinterest/` los CSV que traga la **creación masiva** de Pinterest
Business (hasta 200 pines por archivo, programados en el futuro): gratis, sin su
API —que pide aprobación de app— y sin un programador de pago tipo Tailwind.

Tres decisiones que son el script entero:

- **Las obras con más brecha primero**, y su pin apunta a `/equivalencia`, no a
  la ficha: el titular promete un número y esa es la página que lo responde.
  Sin brecha el pin va a la ficha y el titular no promete nada que no esté ahí.
- **La brecha se calcula con la misma regla que el sitio** (máximo `numero` por
  tipo). Un pin que promete 1.775 capítulos y una ficha que enseña otra cifra
  quema la visita que costó traer.
- **`--por-dia` reparte las fechas.** Publicar 200 pines el mismo día es la forma
  más rápida de que una cuenta nueva se marque como spam; 10 al día, entre las
  09:00 y las 21:00 UTC, es el ritmo que aguanta.

`pinterest/enviados.txt` es el estado entero: la corrida siguiente empieza donde
acabó la anterior. Borrarlo vuelve a empezar desde el principio.

Falta un paso a mano, una sola vez: **reclamar el dominio**. Pinterest da un
`<meta name="p:domain_verify">`; se pone en `PUBLIC_PINTEREST_VERIFICATION` y
`Base.astro` lo emite. Sin eso los pines no llevan atribución, no hay analítica y
no se activan los **Rich Pins**, que rellenan título y descripción del pin desde
el Open Graph que la página ya tiene.

### Qué se buscó para llegar aquí

`PUBLIC_GSC_VERIFICATION` emite el `<meta name="google-site-verification">` de
Search Console (la alternativa al TXT de DNS). Sin la variable no se emite nada.

GSC es lo único que dice **qué consulta** trajo cada visita: con eso se sabe cuál
de los ~8 títulos alternativos de una obra recibe impresiones de verdad, y ese es
el que debe ir en el `<title>` y el `h1`. Cloudflare Web Analytics mide visitas,
no consultas; `npm run palabras` dice qué se busca en general, no qué te
encuentra a ti. Es la realimentación que le faltaba al ciclo.

Bing Webmaster Tools se verifica solo importando desde GSC y acepta 10.000 URLs
al día por su API — encima de lo que ya manda IndexNow.

### Analítica sin banner

`PUBLIC_CF_ANALYTICS_TOKEN` activa Cloudflare Web Analytics: gratis, sin límite
y **sin cookies**, así que el sitio no necesita banner de consentimiento — que
es fricción justo antes del primer scroll. Sin el token no se emite ningún
script, y `npm run dev` sigue limpio.

### Leer sin salir del sitio

Al pinchar un capítulo se abre a pantalla completa encima de la ficha, con una
✕ grande para cerrar. La sesión se queda aquí.

```
/leer?u=<url del capítulo>
        │
   functions/leer.ts  ──fetch──▶  la fuente
        │
   HTMLRewriter inyecta <base href="…"> y NO copia el X-Frame-Options
        │
   el <iframe> del visor lo muestra; las imágenes van del lector a la scan
```

**No se guarda nada.** Llega la petición, se pide el HTML a la fuente, se
devuelve, y cuando termina no queda un byte. No es un caché ni una copia: es el
mismo enlace de siempre, servido a través.

**Y sale gratis.** Solo pasa por aquí el *documento*. El `<base>` que se inyecta
hace que el navegador resuelva las imágenes, el CSS y el JS contra el origen, así
que los 20-50 archivos pesados de un capítulo no nos cuestan nada: es **una
invocación por capítulo abierto**, sobre las 100.000 diarias del plan gratis, y
en Cloudflare el ancho de banda no se mide.

**Por qué un proxy y no un iframe a secas.** La primera versión iba directa y
solo el **42,8 %** de los capítulos se dejaba: el resto manda `X-Frame-Options`
o `frame-ancestors`, el marco sale en blanco y el navegador no deja detectarlo
desde JavaScript. Esa cabecera la aplica el navegador sobre la respuesta que le
llega, así que no hay técnica de cliente que la salte — la respuesta tiene que
venir de aquí. Comprobado: las cinco fuentes que bloqueaban el iframe
(imperiomanhua 34,1 %, anslid 10,4 %, mangadex, wetriedtls, webtoons) responden
200 a una petición desde el servidor.

**HTMLRewriter** y no una plantilla: es el parser en streaming del runtime, así
que la respuesta empieza a salir mientras todavía entra y un capítulo de 2 MB de
HTML no se guarda entero en memoria.

Cinco decisiones que son el resto del archivo:

- **La lista de dominios es cerrada** (`src/lib/fuentes.ts`, la genera
  `npm run dominios`). Sin ella `/leer?u=` sería un proxy abierto y cualquiera
  pediría lo que quisiera desde nuestra IP. Es el criterio de `/portadas.json`.
- **El `<base>` es la URL FINAL**, la de después de los redirects, y antes se
  quita el `<base>` que traiga la página: uno con `href="/"` rompe sus rutas.
- **No se copian** `X-Frame-Options`, `Content-Security-Policy` ni `Set-Cookie`
  —una cookie de la scan en nuestro dominio sería una fuga entre sitios— ni
  `Content-Encoding`/`Content-Length`, que describen el cuerpo original y sobre
  uno reescrito dan una respuesta corrupta.
- **`X-Robots-Tag: noindex`**: la página que Google debe indexar es
  `/novela/<slug>/capitulo-N`, no esta.
- **El `sandbox` no lleva `allow-top-navigation`**, que es lo único que impide
  que una scan con frame-busting se lleve al lector fuera del sitio de un salto.

> ⚠ Lo que esto no garantiza: que una fuente hecha en React pinte igual. Su HTML
> llega siempre, pero dibuja el capítulo con JS que llama a SU API, y esa llamada
> sale ahora desde nuestro dominio: si su CORS no lo permite, el capítulo no
> aparece. Por eso el enlace «Abrir en …» está siempre en la barra del visor, y
> por eso una fuente caída devuelve una página que lo explica en vez de un marco
> en blanco.

Ctrl/Cmd/Shift y el botón central siguen abriendo pestaña —es lo que espera
quien quiere tres capítulos a la vez—, el `href` real se queda en el HTML (sin
JS el enlace funciona igual) y al cerrar se vacía el `src` en las tres salidas,
no solo en el evento `close`: hay navegadores donde ese evento no llega y el
marco se quedaba corriendo detrás.

```bash
npm run test:leer     # la puerta, las cabeceras, el <base> y la fuente caída
npm run dominios      # regenera la lista al añadir un sitio
```

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
3. Variables de entorno: `SITE_URL`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`
   y, opcionales, `PUBLIC_CF_ANALYTICS_TOKEN` (analítica) y
   `PUBLIC_GSC_VERIFICATION` (Search Console) y
   `PUBLIC_PINTEREST_VERIFICATION` (reclamar el dominio en Pinterest).
   En los *secrets* de GitHub hace falta además `SITE_URL` (lo usa IndexNow).
4. Apunta el dominio y actualiza el `Sitemap:` de `public/robots.txt`.

## Poner en marcha el catálogo

En el SQL Editor de Supabase, en este orden:

```
schema.sql  →  schema-fuentes.sql  →  schema-catalogo.sql  →  seed-sitios.sql
```

Después, una vez:

```sql
insert into public.admins values ('test@gmail.com');
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
npm run test:portada                               # proxy de portadas, sin red
npm run test:capitulo                              # pagina de capitulo del edge, sin red
npm run test:leer                                  # el visor de capitulos, sin red
node --experimental-strip-types src/lib/fuentes.test.ts
node --experimental-strip-types src/lib/api.test.ts
node --experimental-strip-types src/lib/capitulos.test.ts
```

`test:scrapear` sustituye `fetch` por HTML fijo: comprueba los dos adaptadores,
la numeración, el slug y que se respete `robots.txt`, sin depender de que los
sitios de origen estén arriba hoy.

---

Portadas en `public/portadas/` son placeholders SVG generados. Las obras
descubiertas traen la portada del sitio de origen; sustituirlas por una copia
propia desde `/admin` es lo recomendable.
