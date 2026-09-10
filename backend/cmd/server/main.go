package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/config"
	"github.com/vaultdrop/backend/db"
	"github.com/vaultdrop/backend/handlers"
	"github.com/vaultdrop/backend/ocr"
	"github.com/vaultdrop/backend/pkg/auth"
	"github.com/vaultdrop/backend/repository"
	"github.com/vaultdrop/backend/service"
)

func newRouter() *gin.Engine {
	r := gin.Default()
	handlers.RegisterRoutes(r)
	return r
}

func main() {

	err, cfg := config.LoadApplicationConfig()

	if err != nil {
		log.Fatalln(err)
	}

	conn, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connexion postgres: %v", err)
	}

	if err := db.MigrateDatabase(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrations postgres: %v", err)
	}

	authManager, err := auth.NewManager(cfg.AuthSecret)
	if err != nil {
		log.Fatalln(err)
	}
	handlers.Auth = authManager

	repo := repository.NewRepository(conn)
	handlers.Store = service.NewResources(
		repo,
		cfg.UploadDir,
		cfg.MaxFileSizeMB*1024*1024,
	)
	handlers.Ocr = service.NewOcr(repo, cfg.UploadDir, cfg.OcrLang, ocr.NewTesseract())

	if err := newRouter().Run(fmt.Sprintf(":%d", cfg.Port)); err != nil {
		log.Fatalln(err)
	}

}
