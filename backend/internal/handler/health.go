package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
)

type HealthHandler struct {
	ocr interface{ HealthCheck() error }
}

func (h *HealthHandler) Check(c *gin.Context) {
	api.Success(c, gin.H{"status": "healthy"})
}
