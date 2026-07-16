package handler

import (
	"github.com/vaultdrop/backend/internal/auth"
	"github.com/vaultdrop/backend/internal/service"
)

type Handler struct {
	File   *FileHandler
	OCR    *OCRHandler
	Health *HealthHandler
	Auth   *auth.AuthHandler
}

func New(fileSvc *service.FileService, ocrSvc *service.OCRService, urlSvc *service.URLService, authHandler *auth.AuthHandler, conversionSvc *service.ConversionService) *Handler {
	return &Handler{
		File:   &FileHandler{files: fileSvc, urls: urlSvc, ocr: ocrSvc, conversion: conversionSvc},
		OCR:    &OCRHandler{ocr: ocrSvc, files: fileSvc},
		Health: &HealthHandler{ocr: ocrSvc},
		Auth:   authHandler,
	}
}
