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
| `src/lib/mockData.ts` | Datos de prueba: 4 novelas, 480 capítulos generados, anclas manhwa↔novela. |
| `src/lib/api.ts` | **Única puerta a los datos.** Todo async: cambiar mock → Supabase no toca ninguna página. |
| `src/lib/equivalencia.ts` | Conversión capítulo de manhwa → capítulo de novela (interpola entre anclas). |
| `src/lib/supabaseClient.ts` | Cliente + login con Google. **Incluye el paso a paso de OAuth en comentarios.** |
| `src/lib/progress.ts` | Progreso: siempre localStorage, además Supabase si hay sesión. |
| `src/components/ReadTrackerButton.astro` | Check animado estilo Things 3. Mismo botón para invitado y logueado. |
| `src/components/ManhwaToNovelBridge.astro` | «¿Vienes del manhwa?» → capítulo exacto de la novela. |
| `src/components/SyncExplanationBanner.astro` | Explica local vs nube. Se cierra o desaparece al iniciar sesión. |
| `supabase/schema.sql` | Tabla `progreso` + RLS. Pegar en el SQL Editor. |
| `public/_headers` | `CDN-Cache-Control: s-maxage=86400, stale-while-revalidate` en el edge. |

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

## Pasar de mock a Supabase

Ejecuta `supabase/schema.sql`, descomenta las tablas de catálogo del final y reescribe las funciones de `src/lib/api.ts` con queries. Nada más cambia: las páginas ya consumen esa API.

## Check

```bash
node --experimental-strip-types src/lib/api.test.ts
```

---

Portadas en `public/portadas/` son placeholders SVG generados; reemplázalos por las portadas reales (una sola imagen por novela).
