import os
import base64
import logging
from io import BytesIO

import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("paddleocr-server")

OCR_LANG = os.getenv("OCR_LANG", "fr")

print(f"[INIT] Initializing PaddleOCR (lang={OCR_LANG})...", flush=True)
ocr_engine = PaddleOCR(
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    lang=OCR_LANG,
)
print("[INIT] PaddleOCR ready.", flush=True)

app = FastAPI()


class OCRRequest(BaseModel):
    image: str


@app.get("/health")
def health():
    return {"status": "healthy", "service": "PaddleOCR Server"}


@app.post("/ocr")
def ocr_json(req: OCRRequest):
    print(f"[OCR] Request received, image field length: {len(req.image)}", flush=True)
    try:
        img_bytes = base64.b64decode(req.image)
    except Exception as e:
        print(f"[OCR] Base64 decode failed: {e}", flush=True)
        return JSONResponse(
            status_code=400,
            content={"errorCode": 1, "message": "invalid base64 image"},
        )
    print(f"[OCR] Decoded {len(img_bytes)} bytes, header: {img_bytes[:32].hex()}", flush=True)
    return run_ocr(img_bytes)


@app.post("/ocr/upload")
def ocr_upload(file: UploadFile = File(...)):
    img_bytes = file.file.read()
    print(f"[OCR] Upload received, {len(img_bytes)} bytes, header: {img_bytes[:32].hex()}", flush=True)
    return run_ocr(img_bytes)


def run_ocr(img_bytes: bytes):
    try:
        image = Image.open(BytesIO(img_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
        img_array = np.array(image)
        print(f"[OCR] Image decoded: {img_array.shape}", flush=True)
    except Exception as e:
        print(f"[OCR] Image decode FAILED: {e}", flush=True)
        return JSONResponse(
            status_code=400,
            content={"errorCode": 1, "message": f"failed to decode image: {e}"},
        )

    try:
        result = list(ocr_engine.predict(img_array))

        pages = []
        for r in result:
            raw = r._to_json()
            data = raw.get("res", raw)
            pages.append({
                "rec_texts": data.get("rec_texts", []),
                "rec_scores": [float(s) for s in data.get("rec_scores", [])],
                "rec_boxes": data.get("rec_boxes", []),
                "rec_polys": data.get("rec_polys", []),
            })

        return {"errorCode": 0, "result": {"ocrResults": pages}}

    except Exception as e:
        logger.exception("OCR failed")
        return JSONResponse(
            status_code=500,
            content={"errorCode": 2, "message": str(e)},
        )
