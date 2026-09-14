package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/pkg/api"
	"github.com/vaultdrop/backend/repository"
)

// ShareLinkGet resolves a public share link without authentication
// (GET /shares/links/:token). Returns resource metadata only — never the
// owner's identity beyond what the contract exposes.
func ShareLinkGet(c *gin.Context) {
	if Store == nil || Store.Repository == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	token := c.Param("token")
	link, err := Store.Repository.Shares.GetPublicLink(token)
	if err != nil {
		if err == repository.ErrNotFound {
			api.Error(c, http.StatusNotFound, "NOT_FOUND", "link not found or revoked")
			return
		}
		api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not resolve link")
		return
	}
	api.OK(c, link)
}
