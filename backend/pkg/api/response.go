package api

import "github.com/gin-gonic/gin"

const NotImplementedCode = "NOT_IMPLEMENTED"

type Meta struct {
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
	Total    int `json:"total"`
}

func OK(c *gin.Context, data any) {
	c.JSON(200, gin.H{"data": data})
}

func OKList(c *gin.Context, data any, page, pageSize, total int) {
	c.JSON(200, gin.H{
		"data": data,
		"meta": Meta{Page: page, PageSize: pageSize, Total: total},
	})
}

func Error(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{"code": code, "message": message},
	})
}

func NotImplemented(c *gin.Context) {
	Error(c, 501, NotImplementedCode, "route not implemented yet")
}
