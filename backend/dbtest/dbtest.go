package dbtest

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/lib/pq"

	"github.com/vaultdrop/backend/db"
)

// OpenTestDatabase ensures the test database exists, resets its schema, runs
// all migrations, and returns a live connection (closed via t.Cleanup).
// Tests are skipped when Postgres is unreachable. `databaseURL` empty falls
// back to TEST_DATABASE_URL, then to the global default.
func OpenTestDatabase(t *testing.T, databaseURL string) *sql.DB {
	t.Helper()

	switch {
	case databaseURL == "":
		databaseURL = os.Getenv("TEST_DATABASE_URL")
	case os.Getenv("TEST_DATABASE_URL") != "":
		databaseURL = os.Getenv("TEST_DATABASE_URL")
	}
	if databaseURL == "" {
		databaseURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_test?sslmode=disable"
	}

	probe, err := sql.Open("postgres", databaseURL)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := probe.Ping(); err != nil {
		probe.Close()
		t.Skipf("postgres indisponible (%v) — lancez `docker compose up postgres -d`", err)
	}
	probe.Close()

	ensureDatabase(t, databaseURL)

	resetConn, err := sql.Open("postgres", databaseURL)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := resetConn.Exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatalf("reset schema: %v", err)
	}
	resetConn.Close()

	if err := db.MigrateDatabase(databaseURL); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	conn, err := sql.Open("postgres", databaseURL)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := conn.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func ensureDatabase(t *testing.T, databaseURL string) {
	t.Helper()
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("parse url: %v", err)
	}
	dbName := strings.TrimPrefix(parsed.Path, "/")
	maintenance := *parsed
	maintenance.Path = "/postgres"

	conn, err := sql.Open("postgres", maintenance.String())
	if err != nil {
		t.Fatalf("open maintenance db: %v", err)
	}
	defer conn.Close()
	if err := conn.Ping(); err != nil {
		t.Fatalf("ping maintenance db: %v", err)
	}

	var exists bool
	if err := conn.QueryRow(`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)`, dbName).Scan(&exists); err != nil {
		t.Fatalf("check db exists: %v", err)
	}
	if !exists {
		if _, err := conn.Exec(fmt.Sprintf(`CREATE DATABASE %s`, pq.QuoteIdentifier(dbName))); err != nil {
			t.Fatalf("create database: %v", err)
		}
	}
}
