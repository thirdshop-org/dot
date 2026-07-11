package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, gin.H{
		"data": data,
	})
}

func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, gin.H{
		"data": data,
	})
}

func Paginated(c *gin.Context, data interface{}, page, total int) {
	c.JSON(http.StatusOK, gin.H{
		"data": data,
		"meta": gin.H{
			"page":  page,
			"total": total,
		},
	})
}

func Error(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"code":    code,
			"message": message,
		},
	})
}
