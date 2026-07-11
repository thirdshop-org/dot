package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func CreateOcrJob(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "OCR job creation not yet implemented",
		},
	})
}

func GetOcrJobStatus(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{
		"error": gin.H{
			"code":    "JOB_NOT_FOUND",
			"message": "OCR job not found",
		},
	})
}
