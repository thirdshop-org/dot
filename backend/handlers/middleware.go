package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
	"github.com/vaultdrop/backend/pkg/auth"
	"github.com/vaultdrop/backend/repository"
)

const (
	UserIDKey   = "user_id"
	DeviceIDKey = "device_id"
)

// Auth issues/verifies device bearer tokens; set once at startup (cmd/server).
var Auth *auth.Manager

// RequireAuth authenticates the bearer paseto token. Le subject (user_id)
// autorise — c'est la clé de scoping de toutes les ressources ; device_id est
// porté (non autorisant) pour l'idempotence outbox et les jobs OCR. Le compte
// doit encore exister (cf. docs/api-v1.md §2).
func RequireAuth(c *gin.Context) {

	header := c.GetHeader("Authorization")
	token, found := strings.CutPrefix(header, "Bearer ")

	if Auth == nil || !found || token == "" {
		api.Error(c, http.StatusUnauthorized, "UNAUTHORIZED", "missing bearer token")
		c.Abort()
		return
	}

	identity, err := Auth.Verify(token)
	if err != nil {
		api.Error(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
		c.Abort()
		return
	}

	// Le store peut être nil dans les tests middleware purs ; sinon on vérifie
	// que le compte existe toujours (supprimé → accès refusé).
	if Store != nil && Store.Repository != nil {
		_, err := Store.Repository.Users.GetByID(identity.UserID)
		if errors.Is(err, repository.ErrNotFound) {
			api.Error(c, http.StatusUnauthorized, "UNAUTHORIZED", "account no longer exists")
			c.Abort()
			return
		}
		if err != nil {
			api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not load account")
			c.Abort()
			return
		}
	}

	c.Set(UserIDKey, identity.UserID)
	c.Set(DeviceIDKey, identity.DeviceID)
	c.Next()

}
