package db

import (
	"database/sql"
	"fmt"
	"os"

	_ "modernc.org/sqlite"
)

const driver = "sqlite"

func Connect() (*sql.DB, error) {
	path := os.Getenv("DB_PATH")
	if path == "" {
		path = "vaultdrop.db"
	}

	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on", path)

	database, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	database.SetMaxOpenConns(1)

	if err := database.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return database, nil
}
