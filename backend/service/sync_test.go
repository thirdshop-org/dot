package service

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/vaultdrop/backend/dbtest"
	"github.com/vaultdrop/backend/repository"
)

const serviceTestURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_service_test?sslmode=disable"

// newServiceStore returns a Resources service over a fresh migrated test DB.
func newServiceStore(t *testing.T) *Resources {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, serviceTestURL)
	repo := repository.NewRepository(conn)
	return NewResources(repo, t.TempDir(), 100)
}

// mustCreateUser creates a plain (non-admin) account and returns its id.
func mustCreateUser(t *testing.T, repo *repository.Repository, username string) string {
	t.Helper()
	id, err := repo.Users.Create(username, username, "test-hash", false)
	if err != nil {
		t.Fatalf("create user %q: %v", username, err)
	}
	return id
}

// mustRegisterDevice registers a device (idempotent) and returns its id.
func mustRegisterDevice(t *testing.T, repo *repository.Repository, deviceID string) string {
	t.Helper()
	if err := repo.Devices.Upsert(deviceID); err != nil {
		t.Fatalf("register device: %v", err)
	}
	return deviceID
}

func strp(v string) *string { return &v }

// syncOp builds a SyncOperation with a payload serialized as JSON.
func syncOp(operationID, resourceID, operation, resourceType string, payload any) SyncOperation {
	raw, _ := json.Marshal(payload)
	return SyncOperation{
		OperationID:  operationID,
		ResourceID:   strp(resourceID),
		ResourceType: strp(resourceType),
		Operation:    operation,
		Payload:      raw,
	}
}

func TestValidateSyncOp(t *testing.T) {
	hexID := repository.NewID()

	valid := syncOp(hexID, hexID, OpCreateResource, "file", map[string]any{"name": "x.txt"})
	if err := validateSyncOp(&valid); err != nil {
		t.Errorf("op valide rejetée: %v", err)
	}

	cases := []struct {
		name string
		op   SyncOperation
	}{
		{"operation_id non 32-hex", syncOp("UPPERCASE", hexID, OpCreateResource, "file", map[string]any{"name": "x"})},
		{"operation_id trop court", syncOp("abc", hexID, OpCreateResource, "file", map[string]any{"name": "x"})},
		{"operation vide", func() SyncOperation {
			o := syncOp(hexID, hexID, OpCreateResource, "file", map[string]any{"name": "x"})
			o.Operation = ""
			return o
		}()},
		{"operation inconnue", syncOp(hexID, hexID, "explode", "file", map[string]any{"name": "x"})},
		{"resource_id non 32-hex", syncOp(hexID, "not-hex", OpCreateResource, "file", map[string]any{"name": "x"})},
		{"resource_type invalide", syncOp(hexID, hexID, OpCreateResource, "document", map[string]any{"name": "x"})},
		{"resource_type manquant", func() SyncOperation {
			o := syncOp(hexID, hexID, OpCreateResource, "file", map[string]any{"name": "x"})
			o.ResourceType = nil
			return o
		}()},
	}
	for _, tc := range cases {
		if err := validateSyncOp(&tc.op); err == nil {
			t.Errorf("%s: validation attendue à échouer", tc.name)
		}
	}
}

func TestValidateSyncOpAckOnlyOpsSkipResourceValidation(t *testing.T) {
	// Les ops partage/lien sont accusées réception SANS état serveur : ni
	// resource_id ni resource_type ne sont exigés.
	for _, opType := range []string{OpShare, OpRevokeShare, OpUpdateShare, OpCreateLink, OpRevokeLink} {
		op := SyncOperation{
			OperationID: repository.NewID(),
			Operation:   opType,
			Payload:     json.RawMessage(`{}`),
		}
		if err := validateSyncOp(&op); err != nil {
			t.Errorf("%s: ack-only op rejetée: %v", opType, err)
		}
	}
}

func TestApplyBatchRejectsInvalidOperationID(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-invalid")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	result, err := s.ApplyBatch(userID, deviceID, []SyncOperation{
		syncOp("NOT-32-HEX", repository.NewID(), OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil {
		t.Fatalf("attendu applied=0 + échec, got %+v", result)
	}
	if result.Failed.OperationID != "NOT-32-HEX" || result.Failed.Code != "INVALID_REQUEST" {
		t.Errorf("failed inattendu: %+v", result.Failed)
	}
}

func TestApplyBatchAckOnlyOpsRecordedWithoutState(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-ack")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	ops := []SyncOperation{
		syncOp(repository.NewID(), repository.NewID(), OpShare, "file", map[string]any{}),
		syncOp(repository.NewID(), repository.NewID(), OpCreateLink, "file", map[string]any{}),
	}
	result, err := s.ApplyBatch(userID, deviceID, ops)
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 2 || result.Failed != nil {
		t.Errorf("attendu applied=2, got %+v", result)
	}
	// Aucune ressource ne doit avoir été créée.
	files, total, _ := s.Repo.ListFiles(userID, "", 10, 0, "created_at", "desc")
	if len(files) != 0 || total != 0 {
		t.Errorf("aucune ressource attendue, got %d", total)
	}

	// Rejeu → toujours accusé, jamais visible.
	result, err = s.ApplyBatch(userID, deviceID, ops)
	if err != nil || result.Applied != 2 {
		t.Errorf("rejeu: applied=%d err=%v", result.Applied, err)
	}
}

func TestApplyBatchUpdateMetadata(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-rename")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	fileID := repository.NewID()
	ops := []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "before.txt"}),
		syncOp(repository.NewID(), fileID, OpUpdateMetadata, "file", map[string]any{"name": "after.txt"}),
	}
	result, err := s.ApplyBatch(userID, deviceID, ops)
	if err != nil || result.Applied != 2 || result.Failed != nil {
		t.Fatalf("ApplyBatch: applied=%d failed=%+v err=%v", result.Applied, result.Failed, err)
	}
	row, err := s.Repo.GetFile(userID, fileID)
	if err != nil {
		t.Fatalf("GetFile: %v", err)
	}
	if row.Name != "after.txt" {
		t.Errorf("nom après update_metadata = %q, attendu after.txt", row.Name)
	}
}

func TestApplyBatchMoveIntoItselfRejected(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-selfmove")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(userID, deviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	}); err != nil {
		t.Fatalf("apply create: %v", err)
	}

	result, err := s.ApplyBatch(userID, deviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpMoveResource, "file", map[string]any{"toFolderResourceId": fileID}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "INVALID_REQUEST" {
		t.Errorf("move dans soi-même: attendu applied=0 INVALID_REQUEST, got %+v", result)
	}
}

func TestApplyBatchMoveToMissingFolder(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-move-missing")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(userID, deviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	}); err != nil {
		t.Fatalf("apply create: %v", err)
	}

	missing := repository.NewID()
	result, err := s.ApplyBatch(userID, deviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpMoveResource, "file", map[string]any{"toFolderResourceId": missing}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "NOT_FOUND" {
		t.Errorf("move vers dossier absent: attendu applied=0 NOT_FOUND, got %+v", result)
	}
}

func TestApplyBatchRejectsInvalidPayloadJSON(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-badpayload")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	op := syncOp(repository.NewID(), repository.NewID(), OpCreateResource, "file", map[string]any{})
	op.Payload = json.RawMessage(`{"name":`)

	result, err := s.ApplyBatch(userID, deviceID, []SyncOperation{op})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "INVALID_REQUEST" {
		t.Errorf("payload JSON invalide: attendu applied=0 INVALID_REQUEST, got %+v", result)
	}
}

func TestApplyBatchRejectsMissingName(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-noname")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	result, err := s.ApplyBatch(userID, deviceID, []SyncOperation{
		syncOp(repository.NewID(), repository.NewID(), OpCreateResource, "file", map[string]any{}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "INVALID_REQUEST" {
		t.Errorf("create sans name: attendu applied=0 INVALID_REQUEST, got %+v", result)
	}
}

func TestApplyBatchDeleteIsIdempotent(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-del")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())

	fileID := repository.NewID()
	ops := []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
		syncOp(repository.NewID(), fileID, OpDeleteResource, "file", map[string]any{}),
	}
	result, err := s.ApplyBatch(userID, deviceID, ops)
	if err != nil || result.Applied != 2 || result.Failed != nil {
		t.Fatalf("ApplyBatch: applied=%d failed=%+v err=%v", result.Applied, result.Failed, err)
	}
	if _, err := s.Repo.GetFile(userID, fileID); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("fichier supprimé attendu NOT_FOUND, got %v", err)
	}

	// Suppression d'une ressource déjà absente → no-op réussi.
	result, err = s.ApplyBatch(userID, deviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpDeleteResource, "file", map[string]any{}),
	})
	if err != nil || result.Applied != 1 || result.Failed != nil {
		t.Errorf("delete absent: applied=%d failed=%+v err=%v", result.Applied, result.Failed, err)
	}
}
