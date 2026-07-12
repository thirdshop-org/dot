package handler

import (
	"github.com/vaultdrop/backend/internal/service"
)

type Handler struct {
	File   *FileHandler
	OCR    *OCRHandler
	NLP    *NLPHandler
	Health *HealthHandler
}

func New(fileSvc *service.FileService, ocrSvc *service.OCRService, nlpSvc *service.NLPService, urlSvc *service.URLService) *Handler {
	return &Handler{
		File:   &FileHandler{files: fileSvc, urls: urlSvc, ocr: ocrSvc},
		OCR:    &OCRHandler{ocr: ocrSvc, files: fileSvc},
		NLP:    &NLPHandler{nlp: nlpSvc, files: fileSvc},
		Health: &HealthHandler{ocr: ocrSvc, nlp: nlpSvc},
	}
}
