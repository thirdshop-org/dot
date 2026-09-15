package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/pkg/api"
)

// RegisterRoutes wires the full /api/v1 surface (public + protected).
// Public: /health, /devices, /auth/login, /shares/links/:token (résolution de
// lien anonyme). Everything else requires a user bearer token (subject =
// user_id, claim = device_id, cf. docs/api-v1.md §2).
func RegisterRoutes(r *gin.Engine) {
	public := r.Group("/api/v1")
	{
		public.GET("/health", Health)
		public.POST("/devices", DevicesRegister)
		public.POST("/auth/login", AuthLogin)
		public.GET("/shares/links/:token", ShareLinkGet)
	}

	protected := r.Group("/api/v1")
	protected.Use(RequireAuth)
	{
		protected.GET("/files", FilesList)
		protected.GET("/files/search", FilesSearch)
		protected.GET("/files/:id", FilesGet)
		protected.DELETE("/files/:id", FilesDelete)
		protected.GET("/files/folders", FoldersList)
		protected.POST("/files/upload", FilesUpload)

		protected.GET("/users/resolve", ResolveUser)
		protected.PATCH("/users/me/password", ChangePassword)

		protected.POST("/ocr/jobs", OcrJobsCreate)
		protected.GET("/ocr/jobs/:id", OcrJobsGet)

		protected.POST("/sync/ops", SyncOpsPush)
		protected.GET("/sync/permissions", SyncPermissionsGet)
	}

	// Route inconnue → enveloppe d'erreur du contrat (jamais de HTML).
	r.NoRoute(func(c *gin.Context) {
		api.Error(c, http.StatusNotFound, "NOT_FOUND", "route not found")
	})
}
