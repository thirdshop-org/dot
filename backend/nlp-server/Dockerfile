FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    spacy \
    fastapi \
    uvicorn \
    python-multipart

RUN python -m spacy download fr_core_news_md

COPY server.py /workspace/server.py

WORKDIR /workspace

EXPOSE 8080

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
