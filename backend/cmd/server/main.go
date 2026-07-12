package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/db"
	"github.com/vaultdrop/backend/internal/handler"
	"github.com/vaultdrop/backend/internal/service"
)

func main() {
	cfg := config.Load()

	database, err := db.Connect()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	migrationsPath := "file://internal/db/migrations"
	if err := db.RunMigrations(migrationsPath); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	queries := db.New(database)

	fileSvc := service.NewFileService(queries, cfg)
	nlpSvc := service.NewNLPService(cfg, fileSvc)
	ocrSvc := service.NewOCRService(cfg, fileSvc)
	urlSvc := service.NewURLService(cfg.HMACSecret, cfg.ServerHost)

	ocrSvc.SetNLPService(nlpSvc)

	ocrSvc.Start()
	defer ocrSvc.Stop()

	nlpSvc.Start()
	defer nlpSvc.Stop()

	h := handler.New(fileSvc, ocrSvc, nlpSvc, urlSvc)

	r := gin.Default()
	handler.SetupRoutes(r, h)

	log.Printf("Server starting on port %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
