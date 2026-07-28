package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/auth"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type ShareHandler struct {
	rebac *service.RebacService
}

func (h *ShareHandler) Grant(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)
	resourceID := c.Param("id")

	var body struct {
		SubjectUserID string `json:"subject_user_id" binding:"required"`
		Role          string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "subject_user_id and role are required")
		return
	}

	if err := h.rebac.GrantRole(userID, resourceID, body.SubjectUserID, body.Role); err != nil {
		api.Error(c, http.StatusForbidden, "FORBIDDEN", err.Error())
		return
	}

	api.Success(c, gin.H{"granted": true})
}

func (h *ShareHandler) Revoke(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)
	resourceID := c.Param("id")
	subjectID := c.Param("userId")

	if err := h.rebac.RevokeRole(userID, resourceID, subjectID); err != nil {
		api.Error(c, http.StatusForbidden, "FORBIDDEN", err.Error())
		return
	}

	api.Success(c, gin.H{"revoked": true})
}

func (h *ShareHandler) List(c *gin.Context) {
	resourceID := c.Param("id")

	relations, err := h.rebac.ListShares(resourceID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list shares")
		return
	}

	type shareResponse struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}

	resp := make([]shareResponse, len(relations))
	for i, r := range relations {
		resp[i] = shareResponse{
			UserID: r.SubjectUserID.String(),
			Role:   r.Role,
		}
	}

	api.Success(c, resp)
}

func (h *ShareHandler) Check(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)
	resourceID := c.Param("id")

	role, err := h.rebac.ResolveEffectiveRole(userID, resourceID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to resolve role")
		return
	}

	api.Success(c, gin.H{
		"role":   role,
		"access": role != "",
	})
}
