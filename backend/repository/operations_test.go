package repository

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/vaultdrop/backend/dbtest"
)

func newTestOperations(t *testing.T) (*Operations, *Devices) {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, repositoryTestURL)
	return &Operations{DB: conn}, &Devices{DB: conn}
}

func TestOperationsRecordAndApplied(t *testing.T) {
	o, devices := newTestOperations(t)
	deviceID := NewID()
	if err := devices.Upsert(deviceID); err != nil {
		t.Fatalf("register device: %v", err)
	}

	opID := NewID()
	applied, err := o.Applied(deviceID, opID)
	if err != nil || applied {
		t.Fatalf("avant record : applied=%v err=%v", applied, err)
	}

	if err := o.Record(deviceID, opID, "create_resource", "resource", nil, NewID(), []byte(`{"name":"x"}`)); err != nil {
		t.Fatalf("record: %v", err)
	}
	applied, err = o.Applied(deviceID, opID)
	if err != nil || !applied {
		t.Fatalf("après record : applied=%v err=%v", applied, err)
	}

	// Rejeu → ON CONFLICT DO NOTHING, aucune erreur.
	if err := o.Record(deviceID, opID, "create_resource", "resource", nil, NewID(), []byte(`null`)); err != nil {
		t.Fatalf("rejeu: %v", err)
	}
	if applied, _ := o.Applied(deviceID, opID); !applied {
		t.Error("rejeu : l'op doit rester appliquée")
	}

	// Idempotence par (device_id, operation_id) : un autre device peut réutiliser
	// le même operation_id sans conflit (les deux rows sont distinctes).
	device02 := NewID()
	if err := devices.Upsert(device02); err != nil {
		t.Fatalf("register device 2: %v", err)
	}
	if err := o.Record(device02, opID, "create_resource", "resource", nil, NewID(), []byte(`{}`)); err != nil {
		t.Errorf("même op_id sur un autre device: %v", err)
	}
}

func TestOperationsRecordRejectsInvalidOperationID(t *testing.T) {
	o, devices := newTestOperations(t)
	if err := devices.Upsert(NewID()); err != nil {
		t.Fatalf("register device: %v", err)
	}

	err := o.Record(NewID(), "UPPERCASENOT32", "create_resource", "resource", nil, NewID(), []byte(`{}`))
	if !errors.Is(err, ErrInvalidOperationID) {
		t.Errorf("operation_id invalide : attendu ErrInvalidOperationID, got %v", err)
	}
}

func TestOperationsRecordNormalizesInvalidPayload(t *testing.T) {
	o, devices := newTestOperations(t)
	deviceID := NewID()
	if err := devices.Upsert(deviceID); err != nil {
		t.Fatalf("register device: %v", err)
	}

	opID := NewID()
	// Un payload non-JSON ne doit pas faire échouer la trace (jsonBytes → {}).
	if err := o.Record(deviceID, opID, "create_resource", "resource", nil, NewID(), []byte(`not-json`)); err != nil {
		t.Fatalf("record: %v", err)
	}

	var stored string
	if err := o.DB.QueryRow(`SELECT payload::text FROM operations WHERE device_id = $1 AND operation_id = $2`, deviceID, opID).Scan(&stored); err != nil {
		t.Fatalf("read payload: %v", err)
	}
	var parsed any
	if err := json.Unmarshal([]byte(stored), &parsed); err != nil {
		t.Fatalf("payload stocké invalide: %q", stored)
	}
	if stored != "{}" {
		t.Errorf("payload normalisé attendu {}, got %q", stored)
	}
}
