package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type OCRHandler struct {
	ocr   *service.OCRService
	files *service.FileService
}

func (h *OCRHandler) CreateJob(c *gin.Context) {
	api.Error(c, http.StatusNotImplemented, "NOT_IMPLEMENTED", "OCR job creation not yet implemented")
}

func (h *OCRHandler) GetJobStatus(c *gin.Context) {
	api.Error(c, http.StatusNotFound, "JOB_NOT_FOUND", "OCR job not found")
}
