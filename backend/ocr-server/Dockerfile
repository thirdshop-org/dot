FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    paddlepaddle==3.0.0 \
    paddleocr==3.3.3 \
    paddlex==3.3.13 \
    fastapi \
    uvicorn \
    python-multipart \
    Pillow \
    numpy \
    pypdfium2

COPY server.py /workspace/server.py

WORKDIR /workspace

EXPOSE 8080

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
