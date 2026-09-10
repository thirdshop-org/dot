package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type ApplicationConfig struct {
	Port          int
	DatabaseURL   string
	UploadDir     string
	MaxFileSizeMB int64
	OcrLang       string
	AuthSecret    string
}

func LoadApplicationConfig() (error, *ApplicationConfig) {

	// .env optionnel — les défauts suffisent pour le dev local.
	_ = godotenv.Load()

	port, err := getInt("PORT", 8080)
	if err != nil {
		return err, nil
	}

	maxSize, err := getInt("MAX_FILE_SIZE_MB", 50)
	if err != nil {
		return err, nil
	}

	return nil, &ApplicationConfig{
		Port:          port,
		DatabaseURL:   get("DATABASE_URL", "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_dev?sslmode=disable"),
		UploadDir:     get("UPLOAD_DIR", "./uploads"),
		MaxFileSizeMB: int64(maxSize),
		OcrLang:       get("OCR_LANG", "fra+eng"),
		AuthSecret:    get("AUTH_SECRET", "dev-secret-change-me"),
	}

}

func get(name string, defaultValue string) string {
	value := os.Getenv(name)
	if value == "" {
		return defaultValue
	}
	return value
}

func getInt(name string, defaultValue int) (int, error) {
	value := os.Getenv(name)
	if value == "" {
		return defaultValue, nil
	}
	return strconv.Atoi(value)
}
