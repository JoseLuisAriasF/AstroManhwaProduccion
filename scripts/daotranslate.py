#!/usr/bin/env python
"""
DaoTranslate (daotranslate.com) → Supabase.

daotranslate está detrás del *managed challenge* de Cloudflare: `fetch`/`curl`
(y hasta un navegador headless) reciben 403. La ÚNICA forma gratis de leerlo es
un navegador REAL con stealth (nodriver) y desde una IP residencial —por eso
este script corre en TU PC, no en GitHub Actions (cuya IP de datacenter Cloudflare
bloquea más fuerte)—.

Qué hace:
  1. Recorre /series/page/N/ y saca todas las novelas (título + URL).
  2. De cada una, lee su lista de capítulos (tandas "Ch. 1-100"…).
  3. Empareja el título con una obra existente (igual criterio que emparejar.mjs):
     si casa con un manhwa ya indexado, la obra pasa a tener también novela
     ("ambos"). Si no casa, se crea como novela nueva (así suma catálogo).
  4. Escribe la fuente + sus capítulos en Supabase.

Uso (con SUPABASE_SERVICE_KEY en .env):
  python scripts/daotranslate.py            # todo
  python scripts/daotranslate.py --limite=5 # solo 5 series (prueba)

Requiere: pip install nodriver requests   (Chrome instalado)
"""
import os, re, sys, json, unicodedata, urllib.parse
import requests
import nodriver as uc

# La consola de Windows es cp1252 y revienta con ✓/…/acentos. Forzar UTF-8.
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

ARGS = dict(a[2:].split('=', 1) if '=' in a[2:] else (a[2:], 'true') for a in sys.argv[1:] if a.startswith('--'))
LIMITE = int(ARGS.get('limite', 0)) or None

# ── .env ──────────────────────────────────────────────────────────────────────
def cargar_env():
    ruta = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(ruta):
        for linea in open(ruta, encoding='utf-8'):
            linea = linea.strip()
            if linea and not linea.startswith('#') and '=' in linea:
                k, v = linea.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

cargar_env()
SB_URL = os.environ.get('PUBLIC_SUPABASE_URL')
SB_KEY = os.environ.get('SUPABASE_SERVICE_KEY')
if not SB_URL or not SB_KEY:
    print('Faltan PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY en .env'); sys.exit(1)
H = {'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}', 'Content-Type': 'application/json'}
BASE = 'https://daotranslate.com'
SITIO = 'DaoTranslate'

# ── Emparejado (mismo criterio que scripts/emparejar.mjs) ─────────────────────
ART = re.compile(r'^(el|la|los|las|un|una|the|a|an)\s+')
def normalizar(t):
    t = unicodedata.normalize('NFD', t or '')
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')  # sin acentos
    t = re.sub(r'[^\w\s]', ' ', t, flags=re.UNICODE).lower().strip()
    t = re.sub(r'\s+', ' ', t)
    return unicodedata.normalize('NFC', t)
def claves(nombre):
    b = normalizar(nombre)
    sa = ART.sub('', b)
    return {b, sa} - {''}

def numero_de(txt):
    m = re.search(r'(?:cap[ií]tulo|chapter|ch)[\s._-]*#?\s*(\d{1,6})', txt or '', re.I) or re.search(r'\b(\d{1,6})\b', txt or '')
    return int(m.group(1)) if m else None

# ── Supabase REST ─────────────────────────────────────────────────────────────
def sb_get_all(tabla, select, filtro=''):
    filas, desde = [], 0
    while True:
        r = requests.get(f'{SB_URL}/rest/v1/{tabla}?select={select}{filtro}',
                         headers={**H, 'Range': f'{desde}-{desde+999}'}, timeout=30)
        r.raise_for_status()
        d = r.json()
        filas += d
        if len(d) < 1000: break
        desde += 1000
    return filas

def sb_upsert(tabla, filas, on_conflict, ignore=False):
    if not filas: return
    pref = 'resolution=ignore-duplicates' if ignore else 'resolution=merge-duplicates'
    r = requests.post(f'{SB_URL}/rest/v1/{tabla}?on_conflict={on_conflict}',
                      headers={**H, 'Prefer': f'{pref},return=minimal'}, data=json.dumps(filas), timeout=60)
    if not r.ok:
        raise RuntimeError(f'{tabla}: {r.status_code} {r.text[:200]}')

# ── nodriver (bypass Cloudflare) ──────────────────────────────────────────────
async def solve(page, extra=2.5):
    for _ in range(12):
        await page.sleep(1.5)
        t = await page.evaluate('document.title')
        if t and 'moment' not in t.lower() and 'just a' not in t.lower():
            break
    await page.sleep(extra)
    return await page.get_content()

def parsear_series(html):
    """De una página de listado: [(titulo, url)] por serie."""
    out, vistos = [], set()
    for m in re.finditer(r'<a[^>]+href="(https://daotranslate\.com/series/[^"/]+/)"[^>]*?(?:title="([^"]+)")?[^>]*>', html):
        url, titulo = m.group(1), (m.group(2) or '').strip()
        if '/feed/' in url or '/list-mode/' in url or url in vistos:
            continue
        vistos.add(url)
        out.append((titulo, url))
    return out

def parsear_capitulos(html):
    """De la página de una serie: (titulo_h1, [(numero, titulo, url)])."""
    h1 = re.search(r'<h1[^>]*class="entry-title"[^>]*>([^<]+)', html) or re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    titulo = (h1.group(1).strip() if h1 else '')
    caps = []
    for m in re.finditer(r'<li[^>]*>\s*<a href="(https://daotranslate\.com/[^"]+)">\s*<div class="epl-num">([^<]+)</div>', html):
        url, num = m.group(1), m.group(2).strip()
        caps.append((numero_de(num), num, url))
    return titulo, caps

async def main():
    print('Abriendo navegador (pasa el challenge de Cloudflare)…', flush=True)
    b = await uc.start(headless=False, browser_args=['--start-maximized', '--no-sandbox'])

    # 1) Recorrer el listado hasta que una página no traiga series nuevas.
    series, vistos = [], set()
    for p in range(1, 200):
        page = await b.get(f'{BASE}/series/page/{p}/')
        html = await solve(page)
        nuevas = [(t, u) for (t, u) in parsear_series(html) if u not in vistos]
        for t, u in nuevas:
            vistos.add(u); series.append((t, u))
        print(f'  página {p}: {len(nuevas)} series nuevas (total {len(series)})', flush=True)
        if not nuevas: break
        if LIMITE and len(series) >= LIMITE: break
    if LIMITE: series = series[:LIMITE]
    print(f'{len(series)} series a procesar.', flush=True)

    # 2) Índice de obras existentes para emparejar.
    print('Cargando catálogo para emparejar…', flush=True)
    obras = sb_get_all('obras', 'slug,titulo,titulos_alternativos')
    indice = {}
    for o in obras:
        for nombre in [o['titulo'], *(o.get('titulos_alternativos') or [])]:
            for k in claves(nombre):
                if len(k) >= 3:
                    indice.setdefault(k, o['slug'])

    casadas = nuevas_obras = 0
    for i, (titulo_lista, url) in enumerate(series, 1):
        page = await b.get(url)
        html = await solve(page)
        titulo, caps = parsear_capitulos(html)
        titulo = titulo or titulo_lista
        if not titulo:
            continue

        # Emparejar contra obras existentes; si no casa, crear la novela.
        slug = None
        for k in claves(titulo):
            if k in indice:
                slug = indice[k]; break
        es_match = bool(slug)
        if slug:
            casadas += 1
        else:
            slug = re.sub(r'[^a-z0-9]+', '-', normalizar(titulo)).strip('-')[:80]
            sb_upsert('obras', [{'slug': slug, 'tipo': 'novela', 'titulo': titulo}], 'slug', ignore=True)
            for k in claves(titulo):
                indice.setdefault(k, slug)
            nuevas_obras += 1

        # Fuente (reusa la de esta obra si ya existe) + sus capítulos.
        prev = requests.get(f'{SB_URL}/rest/v1/fuentes?select=id&obra_slug=eq.{slug}&nombre=eq.{urllib.parse.quote(SITIO)}',
                            headers=H, timeout=30).json()
        fuente = {'nombre': SITIO, 'url_listado': url, 'paginas': 1, 'sel_item': '', 'sel_titulo': '',
                  'sel_enlace': '', 'obra_slug': slug, 'idioma': 'en', 'tipo': 'novela', 'plataforma': 'mangareader'}
        if prev:
            fuente['id'] = prev[0]['id']
            requests.patch(f'{SB_URL}/rest/v1/fuentes?id=eq.{prev[0]["id"]}', headers={**H, 'Prefer': 'return=representation'},
                           data=json.dumps({'url_listado': url}), timeout=30)
            fid = prev[0]['id']
        else:
            r = requests.post(f'{SB_URL}/rest/v1/fuentes', headers={**H, 'Prefer': 'return=representation'},
                              data=json.dumps(fuente), timeout=30)
            r.raise_for_status(); fid = r.json()[0]['id']

        filas = [{'fuente_id': fid, 'obra_slug': slug, 'numero': n, 'titulo': t, 'url': u,
                  'idioma': 'en', 'tipo': 'novela', 'aprobado': True} for (n, t, u) in caps if u]
        if filas:
            sb_upsert('capitulos_externos', filas, 'fuente_id,url', ignore=True)
        print(f'  [{i}/{len(series)}] {"match " if es_match else "nueva "} {titulo[:45]} - {len(filas)} caps', flush=True)

    print(f'\nListo. {casadas} emparejadas con manhwas, {nuevas_obras} novelas nuevas.', flush=True)
    try: b.stop()
    except Exception: pass

uc.loop().run_until_complete(main())
