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

	token, err := Auth.Issue(req.DeviceID)
	if err != nil {
		api.Error(c, 500, "TOKEN_ERROR", "could not issue token")
		return
	}

	api.OK(c, gin.H{"deviceId": req.DeviceID, "token": token})

}
