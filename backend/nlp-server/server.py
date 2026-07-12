import os
import logging
from typing import List, Optional

import spacy
from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nlp-server")

NLP_MODEL = os.getenv("NLP_MODEL", "fr_core_news_md")

print(f"[INIT] Loading spaCy model '{NLP_MODEL}'...", flush=True)
nlp = spacy.load(NLP_MODEL)
print("[INIT] spaCy model ready.", flush=True)

app = FastAPI()


class NLPRequest(BaseModel):
    text: str


class Entity(BaseModel):
    text: str
    label: str
    start: int
    end: int


class NLPEntityResult(BaseModel):
    text: str
    label: str
    start: int
    end: int
    confidence: float


class NLPToken(BaseModel):
    text: str
    lemma: str
    pos: str
    tag: str
    dep: str
    is_stop: bool


class NLPResult(BaseModel):
    entities: List[NLPEntityResult]
    tokens: List[NLPToken]
    noun_chunks: List[str]
    sentences: List[str]


class NLPResponse(BaseModel):
    errorCode: int
    result: Optional[NLPResult] = None
    message: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "healthy", "service": "spaCy NLP Server", "model": NLP_MODEL}


@app.post("/nlp")
def analyze(req: NLPRequest):
    print(f"[NLP] Request received, text length: {len(req.text)}", flush=True)
    try:
        doc = nlp(req.text)

        entities = []
        for ent in doc.ents:
            entities.append(NLPEntityResult(
                text=ent.text,
                label=ent.label_,
                start=ent.start_char,
                end=ent.end_char,
                confidence=0.0,
            ))

        tokens = []
        for token in doc:
            tokens.append(NLPToken(
                text=token.text,
                lemma=token.lemma_,
                pos=token.pos_,
                tag=token.tag_,
                dep=token.dep_,
                is_stop=token.is_stop,
            ))

        noun_chunks = [chunk.text for chunk in doc.noun_chunks]

        sentences = [sent.text.strip() for sent in doc.sents]

        result = NLPResult(
            entities=entities,
            tokens=tokens,
            noun_chunks=noun_chunks,
            sentences=sentences,
        )

        print(f"[NLP] Done: {len(entities)} entities, {len(tokens)} tokens, {len(sentences)} sentences", flush=True)
        return {"errorCode": 0, "result": result}

    except Exception as e:
        logger.exception("NLP analysis failed")
        return {"errorCode": 2, "message": str(e)}
