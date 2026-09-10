package handlers

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
	"github.com/vaultdrop/backend/pkg/auth"
)

const DeviceIDKey = "device_id"

// Auth issues/verifies device bearer tokens; set once at startup (cmd/server).
var Auth *auth.Manager

// RequireDevice authenticates the bearer paseto token and stores the resolved
// device_id in the gin context (cf. docs/api-v1.md §2).
func RequireDevice(c *gin.Context) {

	header := c.GetHeader("Authorization")
	token, found := strings.CutPrefix(header, "Bearer ")

	if Auth == nil || !found || token == "" {
		api.Error(c, 401, "UNAUTHORIZED", "missing bearer token")
		c.Abort()
		return
	}

	deviceID, err := Auth.Verify(token)
	if err != nil {
		api.Error(c, 401, "UNAUTHORIZED", "invalid or expired token")
		c.Abort()
		return
	}

	c.Set(DeviceIDKey, deviceID)
	c.Next()

}
