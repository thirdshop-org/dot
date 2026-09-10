package db

import (
	"database/sql"
	"os"
	"strings"
	"testing"

	_ "github.com/lib/pq"
)

const defaultTestDatabaseURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_migrations_test?sslmode=disable"

func testDatabaseURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = defaultTestDatabaseURL
	}
	conn, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer conn.Close()
	if err := conn.Ping(); err != nil {
		t.Skipf("postgres indisponible (%v) — lancez `docker compose up postgres -d`", err)
	}
	return url
}

func resetSchema(t *testing.T, url string) {
	t.Helper()
	conn, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer conn.Close()
	if _, err := conn.Exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatalf("reset schema: %v", err)
	}
}

func tableNames(t *testing.T, conn *sql.DB) map[string]bool {
	t.Helper()
	rows, err := conn.Query(`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)
	if err != nil {
		t.Fatalf("list tables: %v", err)
	}
	defer rows.Close()
	names := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan: %v", err)
		}
		names[name] = true
	}
	return names
}

func assertTables(t *testing.T, conn *sql.DB, expected ...string) {
	t.Helper()
	got := tableNames(t, conn)
	for _, table := range expected {
		if !got[table] {
			t.Errorf("table manquante après migrate up : %s", table)
		}
	}
}

func assertHexCheck(t *testing.T, conn *sql.DB, table, column string) {
	t.Helper()
	var def string
	err := conn.QueryRow(`
		SELECT pg_get_constraintdef(c.oid)
		FROM pg_constraint c
		JOIN pg_class t ON t.oid = c.conrelid
		WHERE t.relname = $1 AND c.contype = 'c'
		  AND pg_get_constraintdef(c.oid) LIKE '%' || $2 || '%'`,
		table, column).Scan(&def)
	if err != nil {
		t.Fatalf("contrainte CHECK(hex) manquante sur %s.%s: %v", table, column, err)
	}
	if !strings.Contains(def, "^[0-9a-f]{32}$") {
		t.Errorf("CHECK %s.%s attendu avec pattern 32-hex, obtenu : %s", table, column, def)
	}
}

func TestMigrationsUpDown(t *testing.T) {
	url := testDatabaseURL(t)
	resetSchema(t, url)

	if err := MigrateDatabase(url); err != nil {
		t.Fatalf("migrate up: %v", err)
	}

	conn, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer conn.Close()
	if err := conn.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}

	assertTables(t, conn, "users", "devices", "resources", "operations", "ocr_jobs", "schema_migrations")

	assertHexCheck(t, conn, "devices", "device_id")
	assertHexCheck(t, conn, "resources", "resource_id")
	assertHexCheck(t, conn, "operations", "operation_id")
	assertHexCheck(t, conn, "ocr_jobs", "job_id")

	var resourceTypeCheck int
	err = conn.QueryRow(`
		SELECT COUNT(*) FROM pg_constraint c
		JOIN pg_class t ON t.oid = c.conrelid
		WHERE t.relname = 'resources'
		  AND pg_get_constraintdef(c.oid) LIKE '%''file''%'
		  AND pg_get_constraintdef(c.oid) LIKE '%''folder''%'`).Scan(&resourceTypeCheck)
	if err != nil {
		t.Fatalf("check type resources: %v", err)
	}
	if resourceTypeCheck == 0 {
		t.Error("CHECK (type IN ('file','folder')) manquant sur resources")
	}

	var opUnique int
	err = conn.QueryRow(`
		SELECT COUNT(*) FROM pg_index i
		JOIN pg_class t ON t.oid = i.indrelid
		WHERE t.relname = 'operations' AND i.indisunique
		  AND ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
		            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
		            ORDER BY k.ord)::text[] = ARRAY['device_id','operation_id']`).Scan(&opUnique)
	if err != nil {
		t.Fatalf("unique operations: %v", err)
	}
	if opUnique == 0 {
		t.Error("contrainte UNIQUE(device_id, operation_id) manquante sur operations")
	}

	if err := MigrateDownDatabase(url); err != nil {
		t.Fatalf("migrate down: %v", err)
	}

	remaining := tableNames(t, conn)
	delete(remaining, "schema_migrations")
	if len(remaining) > 0 {
		t.Errorf("tables restantes après migrate down : %v", remaining)
	}
}
