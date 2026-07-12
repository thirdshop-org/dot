package handler

import "github.com/gin-gonic/gin"

func SetupRoutes(r *gin.Engine, h *Handler) {
	api := r.Group("/api/v1")

	api.GET("/health", h.Health.Check)

	api.GET("/files", h.File.List)
	api.POST("/files/upload", h.File.Upload)
	api.GET("/files/download/:id", h.File.Download)
	api.GET("/files/:id", h.File.Get)
	api.DELETE("/files/:id", h.File.Delete)

	api.POST("/files/:id/tags", h.File.AddTags)
	api.GET("/files/:id/tags", h.File.GetTags)

	api.POST("/ocr/jobs", h.OCR.CreateJob)
	api.GET("/ocr/jobs/:id", h.OCR.GetJobStatus)
}
