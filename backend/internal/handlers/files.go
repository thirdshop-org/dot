package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func ListFiles(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": []interface{}{},
		"meta": gin.H{
			"page":  1,
			"total": 0,
		},
	})
}

func GetFile(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{
		"error": gin.H{
			"code":    "FILE_NOT_FOUND",
			"message": "File not found",
		},
	})
}

func UploadFile(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Upload not yet implemented",
		},
	})
}

func DeleteFile(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Delete not yet implemented",
		},
	})
}

func SearchFiles(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": []interface{}{},
		"meta": gin.H{
			"page":  1,
			"total": 0,
		},
	})
}

func AddTags(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Add tags not yet implemented",
		},
	})
}

func GetTags(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": []interface{}{},
	})
}
