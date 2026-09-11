# Traductor NLLB-200 (reemplaza a LibreTranslate)

Habla la **misma API que LibreTranslate**, así que `scripts/traducir.mjs` no
cambia: solo apunta a este servidor. Por dentro traduce con NLLB-200 de Meta,
que da mejor prosa que el Argos de LibreTranslate — y eso es lo que Google lee
como contenido.

## Arrancar

```bash
cd traductor
docker compose up -d --build
```

La primera vez baja el modelo (~2,4 GB) y tarda unos minutos en quedar `healthy`.
Queda en un volumen: reiniciar no vuelve a descargarlo.

```bash
docker compose logs -f          # ver la carga ("[traductor] listo")
docker compose ps               # STATUS: healthy cuando ya traduce
```

## Conectarlo al sitio

En el `.env` de la raíz del proyecto:

```
LIBRETRANSLATE_URL=http://localhost:5000
```

Y ya:

```bash
npm run traducir                 # dry-run: dice qué falta
npm run traducir -- --aplicar    # traduce de verdad
npm run traducir -- --idioma=en --limite=500 --aplicar   # solo inglés, 500 obras
```

## Probar a mano

```bash
curl -s http://localhost:5000/health
curl -s http://localhost:5000/translate \
  -H "Content-Type: application/json" \
  -d '{"q":["El regreso de la secta del Monte Hua"],"source":"es","target":"en"}'
```

## Ajustes (variables en docker-compose.yml)

- `NLLB_BEAMS` — `1` rápido (por defecto), `2-4` mejor prosa y más lento.
- `NLLB_BATCH` — frases por lote (16). Bájalo si te quedas sin memoria.
- `NLLB_MODEL` — `facebook/nllb-200-distilled-1.3B` para más calidad (entra en
  4 GB de VRAM con GPU; en CPU va lento).

## GPU

Tienes runtime nvidia y una RTX 3050. Instrucciones en `docker-compose.yml`
(cambiar la línea de torch en el Dockerfile + descomentar el bloque `deploy`).
Por defecto va en CPU porque para un batch nocturno sobra y no falla nunca.

## Apagar

```bash
docker compose down              # para el contenedor, conserva el modelo
docker compose down -v           # además borra el modelo descargado
```
