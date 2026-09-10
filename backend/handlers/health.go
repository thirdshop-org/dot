package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
)

func Health(c *gin.Context) {
	api.OK(c, gin.H{"status": "healthy"})
}
