package handler

import (
	"github.com/vaultdrop/backend/internal/service"
)

type Handler struct {
	File   *FileHandler
	OCR    *OCRHandler
	Health *HealthHandler
}

func New(fileSvc *service.FileService, ocrSvc *service.OCRService, urlSvc *service.URLService) *Handler {
	return &Handler{
		File:   &FileHandler{files: fileSvc, urls: urlSvc, ocr: ocrSvc},
		OCR:    &OCRHandler{ocr: ocrSvc, files: fileSvc},
		Health: &HealthHandler{ocr: ocrSvc},
	}
}
