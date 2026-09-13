package config

import (
	"testing"
)

// clearEnv neutralise toute influence de l'environnement / .env pour le test.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, name := range []string{
		"PORT", "DATABASE_URL", "UPLOAD_DIR", "MAX_FILE_SIZE_MB",
		"OCR_LANG", "AUTH_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD",
	} {
		t.Setenv(name, "")
	}
}

func TestLoadApplicationDefaults(t *testing.T) {
	clearEnv(t)

	err, cfg := LoadApplicationConfig()
	if err != nil {
		t.Fatalf("LoadApplicationConfig: %v", err)
	}
	if cfg.Port != 8080 {
		t.Errorf("Port = %d, attendu 8080", cfg.Port)
	}
	if cfg.MaxFileSizeMB != 50 {
		t.Errorf("MaxFileSizeMB = %d, attendu 50", cfg.MaxFileSizeMB)
	}
	if cfg.DatabaseURL != "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_dev?sslmode=disable" {
		t.Errorf("DatabaseURL défaut inattendu: %q", cfg.DatabaseURL)
	}
	if cfg.UploadDir != "./uploads" {
		t.Errorf("UploadDir défaut inattendu: %q", cfg.UploadDir)
	}
	if cfg.OcrLang != "fra+eng" {
		t.Errorf("OcrLang défaut inattendu: %q", cfg.OcrLang)
	}
	if cfg.AuthSecret != "dev-secret-change-me" {
		t.Errorf("AuthSecret défaut inattendu: %q", cfg.AuthSecret)
	}
	if cfg.AdminUsername != "" || cfg.AdminPassword != "" {
		t.Errorf("identifiants admin doivent être vides par défaut: %+v", cfg)
	}
}

func TestLoadApplicationEnvOverrides(t *testing.T) {
	clearEnv(t)
	t.Setenv("PORT", "9090")
	t.Setenv("MAX_FILE_SIZE_MB", "120")
	t.Setenv("DATABASE_URL", "postgres://u:p@host:5433/db?sslmode=disable")
	t.Setenv("UPLOAD_DIR", "/tmp/up")
	t.Setenv("OCR_LANG", "eng")
	t.Setenv("AUTH_SECRET", "super-secret")
	t.Setenv("ADMIN_USERNAME", "root")
	t.Setenv("ADMIN_PASSWORD", "toor")

	err, cfg := LoadApplicationConfig()
	if err != nil {
		t.Fatalf("LoadApplicationConfig: %v", err)
	}
	if cfg.Port != 9090 || cfg.MaxFileSizeMB != 120 || cfg.DatabaseURL != "postgres://u:p@host:5433/db?sslmode=disable" ||
		cfg.UploadDir != "/tmp/up" || cfg.OcrLang != "eng" || cfg.AuthSecret != "super-secret" ||
		cfg.AdminUsername != "root" || cfg.AdminPassword != "toor" {
		t.Errorf("overrides non appliqués: %+v", cfg)
	}
}

func TestLoadApplicationRejectsInvalidInt(t *testing.T) {
	clearEnv(t)

	t.Setenv("PORT", "not-a-number")
	if err, _ := LoadApplicationConfig(); err == nil {
		t.Error("PORT invalide : attendu une erreur")
	}

	clearEnv(t)
	t.Setenv("MAX_FILE_SIZE_MB", "99999999999999999999999")
	if err, _ := LoadApplicationConfig(); err == nil {
		t.Error("MAX_FILE_SIZE_MB invalide : attendu une erreur")
	}
}
