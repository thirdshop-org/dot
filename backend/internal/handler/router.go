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
	api.GET("/resources/download/:id", h.Resource.Download)
	api.GET("/variants/:id", h.Resource.ServeVariant)

	// Protected
	protected := api.Group("")
	protected.Use(authMiddleware.RequireAuth())

	// Resources
	protected.GET("/resources", h.Resource.List)
	protected.POST("/resources/upload", h.Resource.Upload)
	protected.POST("/resources/move", h.Resource.MoveResources)
	protected.POST("/resources/folders", h.Resource.CreateFolder)
	protected.GET("/resources/folders", h.Resource.ListFolders)
	protected.GET("/resources/folders/:id/resources", h.Resource.ListByParent)
	protected.DELETE("/resources/:id", h.Resource.Delete)
	protected.GET("/resources/:id", h.Resource.Get)

	// Tags
	protected.POST("/resources/:id/tags", h.Resource.AddTags)
	protected.GET("/resources/:id/tags", h.Resource.GetTags)

	// Variants
	protected.GET("/resources/:id/variants", h.Resource.GetVariants)

	// Dedup
	protected.POST("/resources/dedup-check", h.Resource.CheckDuplicates)

	// Sharing (ReBAC)
	protected.POST("/resources/:id/share", h.Share.Grant)
	protected.DELETE("/resources/:id/share/:userId", h.Share.Revoke)
	protected.GET("/resources/:id/share", h.Share.List)
	protected.GET("/resources/:id/access", h.Share.Check)

	// Devices
	protected.GET("/devices", h.Device.List)
	protected.POST("/devices", h.Device.Register)

	// Sync
	protected.POST("/sync/pull", h.Sync.Pull)
	protected.POST("/sync/push", h.Sync.Push)

	// OCR
	protected.POST("/ocr/jobs", h.OCR.CreateJob)
	protected.GET("/ocr/jobs/:id", h.OCR.GetJobStatus)
}
