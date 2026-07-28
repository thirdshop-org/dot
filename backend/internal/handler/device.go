package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/auth"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type DeviceHandler struct {
	placement *service.PlacementService
}

func (h *DeviceHandler) List(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)

	locations, err := h.placement.ListUserLocations(userID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list devices")
		return
	}

	type deviceResponse struct {
		ID         string `json:"id"`
		DeviceName string `json:"device_name"`
		Role       string `json:"role"`
	}

	resp := make([]deviceResponse, len(locations))
	for i, l := range locations {
		resp[i] = deviceResponse{
			ID:         l.ID.String(),
			DeviceName: l.DeviceName,
			Role:       l.Role,
		}
	}

	api.Success(c, resp)
}

func (h *DeviceHandler) Register(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)

	var body struct {
		DeviceName string `json:"device_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "device_name is required")
		return
	}

	loc, err := h.placement.CreateDeviceLocation(userID, body.DeviceName)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to register device")
		return
	}

	api.Created(c, gin.H{
		"id":          loc.ID.String(),
		"device_name": loc.DeviceName,
		"role":        loc.Role,
	})
}
