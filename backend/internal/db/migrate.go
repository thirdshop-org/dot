package db

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite"
	"github.com/golang-migrate/migrate/v4/source/file"
)

func RunMigrations(database *sql.DB, migrationsURL string) error {
	sourceDriver, err := (&file.File{}).Open(migrationsURL)
	if err != nil {
		return fmt.Errorf("open migrations source: %w", err)
	}

	dbDriver, err := sqlite.WithInstance(database, &sqlite.Config{})
	if err != nil {
		return fmt.Errorf("create sqlite driver: %w", err)
	}

	m, err := migrate.NewWithInstance("file", sourceDriver, "sqlite", dbDriver)
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
