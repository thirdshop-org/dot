package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/pkg/api"
	"github.com/vaultdrop/backend/repository"
)

type ocrJobRequest struct {
	FileID string `json:"fileId"`
}

func OcrJobsCreate(c *gin.Context) {
	if Store == nil || Ocr == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	userID := c.GetString(UserIDKey)

	var req ocrJobRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid request")
		return
	}

	job, err := Ocr.Create(userID, c.GetString(DeviceIDKey), req.FileID)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OK(c, job)
}

func OcrJobsGet(c *gin.Context) {
	if Ocr == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	job, err := Ocr.Get(deviceID, c.Param("id"))
	if err != nil {
		if err == repository.ErrJobNotFound {
			api.Error(c, http.StatusNotFound, "NOT_FOUND", "ocr job not found")
			return
		}
		writeError(c, err)
		return
	}
	api.OK(c, job)
}
