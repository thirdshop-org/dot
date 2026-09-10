package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/config"
	"github.com/vaultdrop/backend/handlers"
)

func newRouter() *gin.Engine {

	r := gin.Default()

	api := r.Group("/api/v1")
	{
		api.GET("/health", handlers.Health)
		api.POST("/devices", handlers.DevicesRegister)

		api.GET("/files", handlers.FilesList)
		api.GET("/files/search", handlers.FilesSearch)
		api.GET("/files/:id", handlers.FilesGet)
		api.DELETE("/files/:id", handlers.FilesDelete)
		api.GET("/files/folders", handlers.FoldersList)
		api.POST("/files/upload", handlers.FilesUpload)

		api.POST("/ocr/jobs", handlers.OcrJobsCreate)
		api.GET("/ocr/jobs/:id", handlers.OcrJobsGet)

		api.POST("/sync/ops", handlers.SyncOpsPush)
		api.GET("/sync/permissions", handlers.SyncPermissionsGet)
	}

	return r

}

func main() {

	err, cfg := config.LoadApplicationConfig()

	if err != nil {
		log.Fatalln(err)
	}

	if err := newRouter().Run(fmt.Sprintf(":%d", cfg.Port)); err != nil {
		log.Fatalln(err)
	}

}
