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

	migrationsPath := "file://internal/db/migrations"

	database, err := db.Connect()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	if err := db.RunMigrations(migrationsPath); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	queries := db.New(database)
	h := handlers.New(queries)

	r := gin.Default()

	r.GET("/api/v1/health", h.Health)

	r.GET("/api/v1/files", h.ListFiles)
	r.GET("/api/v1/file/:id", h.ListFile)
	r.POST("/api/v1/files/upload", h.UploadFiles)
	r.GET("/api/v1/files/:id", h.GetFile)
	r.DELETE("/api/v1/files/:id", h.DeleteFile)
	r.GET("/api/v1/files/search", h.SearchFiles)

	r.POST("/api/v1/files/:id/tags", h.AddTags)
	r.GET("/api/v1/files/:id/tags", h.GetTags)

	r.POST("/api/v1/ocr/jobs", h.CreateOcrJob)
	r.GET("/api/v1/ocr/jobs/:id", h.GetOcrJobStatus)

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
