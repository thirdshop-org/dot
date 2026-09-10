package handlers

import (
	"github.com/gin-gonic/gin"
)

// RegisterRoutes wires the full /api/v1 surface (public + protected).
// Public: /health, /devices. Everything else requires a device bearer token.
func RegisterRoutes(r *gin.Engine) {
	public := r.Group("/api/v1")
	{
		public.GET("/health", Health)
		public.POST("/devices", DevicesRegister)
	}

	protected := r.Group("/api/v1")
	protected.Use(RequireDevice)
	{
		protected.GET("/files", FilesList)
		protected.GET("/files/search", FilesSearch)
		protected.GET("/files/:id", FilesGet)
		protected.DELETE("/files/:id", FilesDelete)
		protected.GET("/files/folders", FoldersList)
		protected.POST("/files/upload", FilesUpload)

		protected.POST("/ocr/jobs", OcrJobsCreate)
		protected.GET("/ocr/jobs/:id", OcrJobsGet)

		protected.POST("/sync/ops", SyncOpsPush)
		protected.GET("/sync/permissions", SyncPermissionsGet)
	}
}
