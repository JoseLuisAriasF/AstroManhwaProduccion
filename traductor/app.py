"""
NLLB-200 detrás de la API de LibreTranslate.
─────────────────────────────────────────────────────────────────────────────
`scripts/traducir.mjs` habla con LibreTranslate: POST /translate con
{q, source, target} y espera {translatedText}. Este servidor responde EXACTO
igual, pero traduce con NLLB-200 (Meta) en vez de Argos: misma API, mejor prosa.
Por eso el script no se toca — solo apunta LIBRETRANSLATE_URL aquí.

NLLB usa códigos FLORES-200 (`spa_Latn`), no `es`. El mapa traduce los planos
que manda el script a los del modelo; un idioma fuera del mapa es un 400, no una
traducción a medias.
"""
import os
import re
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODELO = os.environ.get("NLLB_MODEL", "facebook/nllb-200-distilled-600M")
# NLLB es un modelo de FRASE, no de párrafo, y con greedy (beams=1) alucina en
# textos cortos ("Regresión" -> una frase sobre la UE). 4 beams cuesta más
# tiempo pero quita casi todas esas alucinaciones; para sinopsis, que son
# cortas y se traducen de noche, compensa. Bájalo si prefieres velocidad.
BEAMS = int(os.environ.get("NLLB_BEAMS", "4"))

# es→spa_Latn, en→eng_Latn… Solo los idiomas del sitio. Añadir uno es una línea.
FLORES = {
    "es": "spa_Latn",
    "en": "eng_Latn",
    "pt": "por_Latn",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "id": "ind_Latn",
    "vi": "vie_Latn",
}

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[traductor] cargando {MODELO} en {device}…", flush=True)
tokenizer = AutoTokenizer.from_pretrained(MODELO)
model = AutoModelForSeq2SeqLM.from_pretrained(MODELO).to(device)
model.eval()
print("[traductor] listo", flush=True)

app = FastAPI(title="NLLB como LibreTranslate")


class Peticion(BaseModel):
    # El script manda `q` como array (lotes de 40); LibreTranslate también acepta
    # una cadena suelta. Los dos valen y la respuesta imita la forma de entrada.
    q: list[str] | str
    source: str
    target: str
    format: str | None = "text"
    api_key: str | None = None  # se ignora: esto es local, sin claves


@app.post("/translate")
def translate(p: Peticion):
    if p.source not in FLORES or p.target not in FLORES:
        raise HTTPException(400, f"idioma no soportado: {p.source} -> {p.target}")

    una = isinstance(p.q, str)
    textos = [p.q] if una else list(p.q)
    if not textos:
        return {"translatedText": "" if una else []}

    # El cliente (traducir.mjs) va estrictamente en serie: una petición, espera,
    # la siguiente. Por eso mutar src_lang aquí es seguro sin bloqueo.
    tokenizer.src_lang = FLORES[p.source]
    bos = tokenizer.convert_tokens_to_ids(FLORES[p.target])

    # NLLB traduce una frase; un párrafo entero se le queda en la primera. Así
    # que se parte en frases, se traducen TODAS juntas (en un solo lote, sin
    # perder velocidad) y se vuelven a unir en el orden de cada texto.
    frases: list[str] = []
    tramos: list[tuple[int, int]] = []  # (inicio, fin) de cada texto en `frases`
    for t in textos:
        partes = trocear(t)
        tramos.append((len(frases), len(frases) + len(partes)))
        frases.extend(partes)

    traducidas = traducir_frases(frases, bos)

    salida = [" ".join(traducidas[a:b]).strip() for (a, b) in tramos]
    return {"translatedText": salida[0] if una else salida}


# Corta un texto en frases por el punto/interrogación/exclamación finales,
# conservando el signo. No es un tokenizador lingüístico —no hace falta para
# sinopsis— pero evita que NLLB se coma todo menos la primera frase.
_FIN = re.compile(r"(?<=[.!?…])\s+")


def trocear(texto: str) -> list[str]:
    t = (texto or "").strip()
    if not t:
        return [""]
    return [f for f in _FIN.split(t) if f.strip()] or [t]


def traducir_frases(frases: list[str], bos: int) -> list[str]:
    if not frases:
        return []
    out: list[str] = []
    LOTE = int(os.environ.get("NLLB_BATCH", "16"))
    for i in range(0, len(frases), LOTE):
        trozo = frases[i : i + LOTE]
        enc = tokenizer(
            trozo, return_tensors="pt", padding=True, truncation=True, max_length=512
        ).to(device)
        with torch.no_grad():
            gen = model.generate(
                **enc, forced_bos_token_id=bos, max_length=512, num_beams=BEAMS
            )
        out.extend(tokenizer.batch_decode(gen, skip_special_tokens=True))
    return out


@app.get("/languages")
def languages():
    # El formato que devuelve LibreTranslate, por si algún cliente lo consulta.
    return [{"code": c, "name": c, "targets": list(FLORES)} for c in FLORES]


@app.get("/health")
def health():
    return {"ok": True, "device": device, "model": MODELO, "beams": BEAMS}
