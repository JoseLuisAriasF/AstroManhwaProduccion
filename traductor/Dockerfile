# Imagen del traductor NLLB. CPU a propósito: el torch de CPU pesa ~200 MB en
# vez de los ~3 GB del de CUDA, y no depende de emparejar driver/toolkit dentro
# del contenedor. Para un batch nocturno sobra. (GPU: ver docker-compose.yml.)
FROM python:3.11-slim

WORKDIR /app

# torch de CPU desde su índice propio, antes que el resto: así pip no baja las
# ruedas de CUDA que arrastraría transformers.
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY app.py .

# El modelo (~2,4 GB) se baja a /models, que es un volumen: se descarga UNA vez
# y sobrevive a reconstruir la imagen o recrear el contenedor.
ENV HF_HOME=/models

EXPOSE 5000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
