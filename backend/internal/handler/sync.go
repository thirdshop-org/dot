package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type SyncHandler struct {
	sync *service.SyncService
}

func (h *SyncHandler) Pull(c *gin.Context) {
	var body struct {
		LocationID string `json:"location_id"`
	}
	c.ShouldBindJSON(&body)

	var err error
	var items interface{}
	if body.LocationID != "" {
		items, err = h.sync.ListPending(body.LocationID)
	} else {
		items, err = h.sync.ListAllPending()
	}

	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list pending sync items")
		return
	}

	api.Success(c, items)
}

func (h *SyncHandler) Push(c *gin.Context) {
	var body struct {
		LocationID string `json:"location_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "location_id is required")
		return
	}

	items, err := h.sync.ListPending(body.LocationID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list pending sync items")
		return
	}

	api.Created(c, gin.H{
		"pending": len(items),
		"message": "Push initiated",
	})
}
