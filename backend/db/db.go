package db

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	migratepostgres "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/lib/pq"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Open opens a raw *sql.DB (Postgres). Callers must Close it.
func Open(databaseURL string) (*sql.DB, error) {
	conn, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return conn, nil
}

func newMigrator(conn *sql.DB) (*migrate.Migrate, error) {
	source, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("load embedded migrations: %w", err)
	}
	driver, err := migratepostgres.WithInstance(conn, &migratepostgres.Config{})
	if err != nil {
		return nil, fmt.Errorf("init postgres migrate driver: %w", err)
	}
	m, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		return nil, fmt.Errorf("new migrate: %w", err)
	}
	return m, nil
}

// MigrateDatabase applies all pending migrations up to the latest version.
// migrate.ErrNoChange (already up-to-date) is not an error.
func MigrateDatabase(databaseURL string) error {
	conn, err := Open(databaseURL)
	if err != nil {
		return err
	}
	defer conn.Close()
	m, err := newMigrator(conn)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

// MigrateDownDatabase rolls back every migration (used by tests).
func MigrateDownDatabase(databaseURL string) error {
	conn, err := Open(databaseURL)
	if err != nil {
		return err
	}
	defer conn.Close()
	m, err := newMigrator(conn)
	if err != nil {
		return err
	}
	if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}
