package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/pkg/api"
	"github.com/vaultdrop/backend/service"
)

type syncOpsRequest struct {
	Operations []service.SyncOperation `json:"operations"`
}

func SyncOpsPush(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)

	var req syncOpsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
		return
	}

	result, err := Store.ApplyBatch(deviceID, req.Operations)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OK(c, result)
}

func SyncPermissionsGet(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	after := c.Query("after")
	var afterMs int64
	if after != "" {
		afterMs = int64(intParam(after, 0))
	}
	perms, err := Store.Snapshot(deviceID, afterMs)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OK(c, perms)
}
