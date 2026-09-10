package handlers

import (
	"regexp"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
)

var deviceIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

type DeviceRegisterRequest struct {
	DeviceID string `json:"deviceId"`
}

func DevicesRegister(c *gin.Context) {

	var req DeviceRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.DeviceID == "" {
		api.Error(c, 400, "INVALID_REQUEST", "missing deviceId")
		return
	}
	if !deviceIDPattern.MatchString(req.DeviceID) {
		api.Error(c, 400, "INVALID_DEVICE_ID", "deviceId must be 32 lowercase hex chars")
		return
	}

	if Store == nil || Store.Repository == nil {
		api.Error(c, 503, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	if err := Store.Repository.Devices.Upsert(req.DeviceID); err != nil {
		api.Error(c, 500, "INTERNAL", "could not persist device")
		return
	}

	// POST /devices n'émet PLUS de token : de l'identité user-first (V1), le
	// device s'enregistre pour exister, puis le client appelle POST /auth/login
	// avec username/password + device_id pour obtenir son token (cf.
	// docs/api-v1.md §2). Réponse : { deviceId } uniquement.
	api.OK(c, gin.H{"deviceId": req.DeviceID})

}
