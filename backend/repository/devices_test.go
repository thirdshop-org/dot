package repository

import (
	"testing"

	"github.com/vaultdrop/backend/dbtest"
)

func newTestDevices(t *testing.T) *Devices {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, repositoryTestURL)
	return &Devices{DB: conn}
}

func TestDevicesUpsertAndExists(t *testing.T) {
	d := newTestDevices(t)
	deviceID := NewID()

	exists, err := d.Exists(deviceID)
	if err != nil || exists {
		t.Fatalf("device non enregistré : exists=%v err=%v", exists, err)
	}

	if err := d.Upsert(deviceID); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	exists, err = d.Exists(deviceID)
	if err != nil || !exists {
		t.Fatalf("après upsert : exists=%v err=%v", exists, err)
	}

	// Upsert idempotent (ON CONFLICT) → pas d'erreur ni de doublon.
	if err := d.Upsert(deviceID); err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	exists, err = d.Exists(deviceID)
	if err != nil || !exists {
		t.Fatalf("après second upsert : exists=%v err=%v", exists, err)
	}

	var count int
	if err := d.DB.QueryRow(`SELECT COUNT(*) FROM devices WHERE device_id = $1`, deviceID).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("device dupliqué, count = %d", count)
	}
}

func TestDevicesMarkUser(t *testing.T) {
	d := newTestDevices(t)
	deviceID := NewID()
	if err := d.Upsert(deviceID); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	users := &Users{DB: d.DB}
	userID, err := users.Create("device-user", "device-user", "hash", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	if err := d.MarkUser(deviceID, userID); err != nil {
		t.Fatalf("mark user: %v", err)
	}
	var storedUser string
	if err := d.DB.QueryRow(`SELECT user_id FROM devices WHERE device_id = $1`, deviceID).Scan(&storedUser); err != nil {
		t.Fatalf("read user_id: %v", err)
	}
	if storedUser != userID {
		t.Errorf("user_id mémorisé = %q, attendu %q", storedUser, userID)
	}
}
