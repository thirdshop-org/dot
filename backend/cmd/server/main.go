package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/config"
	"github.com/vaultdrop/backend/handlers"
	"github.com/vaultdrop/backend/pkg/auth"
)

func newRouter() *gin.Engine {

	r := gin.Default()

	public := r.Group("/api/v1")
	{
		public.GET("/health", handlers.Health)
		public.POST("/devices", handlers.DevicesRegister)
	}

	protected := r.Group("/api/v1")
	protected.Use(handlers.RequireDevice)
	{
		protected.GET("/files", handlers.FilesList)
		protected.GET("/files/search", handlers.FilesSearch)
		protected.GET("/files/:id", handlers.FilesGet)
		protected.DELETE("/files/:id", handlers.FilesDelete)
		protected.GET("/files/folders", handlers.FoldersList)
		protected.POST("/files/upload", handlers.FilesUpload)

		protected.POST("/ocr/jobs", handlers.OcrJobsCreate)
		protected.GET("/ocr/jobs/:id", handlers.OcrJobsGet)

		protected.POST("/sync/ops", handlers.SyncOpsPush)
		protected.GET("/sync/permissions", handlers.SyncPermissionsGet)
	}

	return r

}

func main() {

	err, cfg := config.LoadApplicationConfig()

	if err != nil {
		log.Fatalln(err)
	}

	authManager, err := auth.NewManager(cfg.AuthSecret)
	if err != nil {
		log.Fatalln(err)
	}
	handlers.Auth = authManager

	if err := newRouter().Run(fmt.Sprintf(":%d", cfg.Port)); err != nil {
		log.Fatalln(err)
	}

}
