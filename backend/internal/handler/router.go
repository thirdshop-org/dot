package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/auth"
)

func SetupRoutes(r *gin.Engine, h *Handler, authMiddleware *auth.AuthService) {
	api := r.Group("/api/v1")

	// Public
	api.GET("/health", h.Health.Check)
	api.POST("/auth/register", h.Auth.Register)
	api.POST("/auth/login", h.Auth.Login)
	api.POST("/auth/refresh", h.Auth.Refresh)
	api.POST("/auth/logout", h.Auth.Logout)

	// Protected
	protected := api.Group("")
	protected.Use(authMiddleware.RequireAuth())

	protected.GET("/files", h.File.List)
	protected.POST("/files/upload", h.File.Upload)
	protected.POST("/files/move", h.File.MoveFiles)
	protected.POST("/files/folders", h.File.CreateFolder)
	protected.GET("/files/folders", h.File.ListFolders)
	protected.GET("/files/folders/:id/files", h.File.ListFilesByParent)
	protected.GET("/files/download/:id", h.File.Download)
	protected.DELETE("/files/:id", h.File.Delete)
	protected.GET("/files/:id", h.File.Get)

	protected.POST("/files/:id/tags", h.File.AddTags)
	protected.GET("/files/:id/tags", h.File.GetTags)

	protected.POST("/ocr/jobs", h.OCR.CreateJob)
	protected.GET("/ocr/jobs/:id", h.OCR.GetJobStatus)

	protected.GET("/files/:id/thumbnails", h.File.GetThumbnails)

	api.GET("/thumbnails/:id", h.File.ServeThumbnail)
}
