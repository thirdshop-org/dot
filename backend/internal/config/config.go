package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port             string
	DatabaseURL      string
	OCREndpoint      string
	UploadDir        string
	HMACSecret       string
	ServerHost       string
	PASETOKey        string
	LibreOfficePath  string
	PdftoppmPath     string
	ThumbnailDir     string
	URLExpiryMinutes int
}

func Load() *Config {
	return &Config{
		Port:             envOr("PORT", "8080"),
		DatabaseURL:      envOr("DATABASE_URL", "postgres://localhost:5432/vaultdrop?sslmode=disable"),
		OCREndpoint:      envOr("OCR_ENDPOINT", "http://localhost:9090"),
		UploadDir:        envOr("UPLOAD_DIR", "./uploads"),
		HMACSecret:       envOr("HMAC_SECRET", "thisismyrandomstring"),
		ServerHost:       envOr("SERVER_HOST", "http://192.168.1.17:8080"),
		PASETOKey:        envOr("PASETO_KEY", "01234567890123456789012345678901234567890123456789012345678901234"),
		LibreOfficePath:  envOr("LIBREOFFICE_PATH", "/usr/bin/libreoffice"),
		PdftoppmPath:     envOr("PDFTOPPM_PATH", "/usr/bin/pdftoppm"),
		ThumbnailDir:     envOr("THUMBNAIL_DIR", "./uploads/thumbnails"),
		URLExpiryMinutes: envOrInt("URL_EXPIRY_MINUTES", 60),
	}
}

func envOrInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
