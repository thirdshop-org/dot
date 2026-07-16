package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/vaultdrop/backend/internal/auth"
	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/db"
	"github.com/vaultdrop/backend/internal/handler"
	"github.com/vaultdrop/backend/internal/service"
)

func main() {
	_ = godotenv.Load()

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
	ocrSvc := service.NewOCRService(cfg, fileSvc)
	conversionSvc := service.NewConversionService(queries, cfg)
	urlSvc := service.NewURLService(cfg.HMACSecret, cfg.ServerHost)
	authSvc, err := auth.NewAuthService(queries, cfg)
	if err != nil {
		log.Fatalf("Failed to create auth service: %v", err)
	}

	ocrSvc.Start()
	defer ocrSvc.Stop()

	conversionSvc.Start()
	defer conversionSvc.Stop()

	h := handler.New(fileSvc, ocrSvc, urlSvc, auth.NewAuthHandler(authSvc), conversionSvc)

	r := gin.Default()
	handler.SetupRoutes(r, h, authSvc)

	log.Printf("Server starting on port %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
