package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/db"
	"github.com/vaultdrop/backend/internal/handlers"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	database, err := db.Connect()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	_ = database // will be passed to handlers once queries are implemented

	r := gin.Default()

	r.GET("/api/v1/health", handlers.Health)

	r.GET("/api/v1/files", handlers.ListFiles)
	r.GET("/api/v1/file/:id", handlers.ListFile)
	r.POST("/api/v1/files/upload", handlers.UploadFile)
	r.GET("/api/v1/files/:id", handlers.GetFile)
	r.DELETE("/api/v1/files/:id", handlers.DeleteFile)
	r.GET("/api/v1/files/search", handlers.SearchFiles)

	r.POST("/api/v1/files/:id/tags", handlers.AddTags)
	r.GET("/api/v1/files/:id/tags", handlers.GetTags)

	r.POST("/api/v1/ocr/jobs", handlers.CreateOcrJob)
	r.GET("/api/v1/ocr/jobs/:id", handlers.GetOcrJobStatus)

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
