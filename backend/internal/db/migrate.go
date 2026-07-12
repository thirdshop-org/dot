package db

import (
	"fmt"
	"log"
	"os"

	"database/sql"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/file"
)

func RunMigrations(migrationsURL string) error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://localhost:5432/vaultdrop?sslmode=disable"
	}

	migDB, err := sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("open migration db: %w", err)
	}
	defer migDB.Close()

	sourceDriver, err := (&file.File{}).Open(migrationsURL)
	if err != nil {
		return fmt.Errorf("open migrations source: %w", err)
	}

	dbDriver, err := postgres.WithInstance(migDB, &postgres.Config{})
	if err != nil {
		return fmt.Errorf("create postgres driver: %w", err)
	}

	m, err := migrate.NewWithInstance("file", sourceDriver, "postgres", dbDriver)
	if err != nil {
		return fmt.Errorf("create migrate instance: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("run migrations: %w", err)
	}

	log.Println("Database migrations applied successfully")
	return nil
}
