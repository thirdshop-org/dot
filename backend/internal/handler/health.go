package handler

import (
	"database/sql"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
)

type HealthHandler struct {
	db  *sql.DB
	ocr interface{ HealthCheck() error }
}

func (h *HealthHandler) Check(c *gin.Context) {
	checks := gin.H{}

	dbErr := h.db.Ping()
	if dbErr != nil {
		checks["database"] = "error: " + dbErr.Error()
	} else {
		checks["database"] = "ok"
	}

	ocrErr := h.ocr.HealthCheck()
	if ocrErr != nil {
		checks["ocr"] = "error: " + ocrErr.Error()
	} else {
		checks["ocr"] = "ok"
	}

	status := "healthy"
	for _, v := range checks {
		if v != "ok" {
			status = "degraded"
			break
		}
	}

	api.Success(c, gin.H{
		"status": status,
		"checks": checks,
	})
}
