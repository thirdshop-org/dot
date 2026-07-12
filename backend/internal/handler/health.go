package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
)

type HealthHandler struct {
	ocr interface{ HealthCheck() error }
	nlp interface{ HealthCheck() error }
}

func (h *HealthHandler) Check(c *gin.Context) {
	status := gin.H{"status": "healthy"}

	if err := h.ocr.HealthCheck(); err != nil {
		status["ocr"] = err.Error()
	} else {
		status["ocr"] = "healthy"
	}

	if err := h.nlp.HealthCheck(); err != nil {
		status["nlp"] = err.Error()
	} else {
		status["nlp"] = "healthy"
	}

	api.Success(c, status)
}
