package config

import "os"

type Config struct {
	Port         string
	DBPath       string
	OCREndpoint  string
	UploadDir    string
	HMACSecret   string
	ServerHost   string
}

func Load() *Config {
	return &Config{
		Port:        envOr("PORT", "8080"),
		DBPath:      envOr("DB_PATH", "vaultdrop.db"),
		OCREndpoint: envOr("OCR_ENDPOINT", "http://localhost:9090"),
		UploadDir:   envOr("UPLOAD_DIR", "./uploads"),
		HMACSecret:  envOr("HMAC_SECRET", "thisismyrandomstring"),
		ServerHost:  envOr("SERVER_HOST", "http://localhost:8080"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
