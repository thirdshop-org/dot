package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type NLPHandler struct {
	nlp   *service.NLPService
	files *service.FileService
}

func (h *NLPHandler) CreateJob(c *gin.Context) {
	api.Error(c, http.StatusNotImplemented, "NOT_IMPLEMENTED", "NLP job creation not yet implemented")
}

func (h *NLPHandler) GetJobStatus(c *gin.Context) {
	api.Error(c, http.StatusNotFound, "JOB_NOT_FOUND", "NLP job not found")
}
