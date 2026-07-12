package db

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/lib/pq"
)

const driver = "postgres"

func Connect() (*sql.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://localhost:5432/vaultdrop?sslmode=disable"
	}

	database, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	database.SetMaxOpenConns(25)

	if err := database.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return database, nil
}
