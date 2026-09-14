package service

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

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

// shareTestDeviceID is a fixed 32-hex device registered by each share test.
const shareTestDeviceID = "a0000000000000000000000000000001"

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

func TestValidateSyncOpShareOpsRequireResourceID(t *testing.T) {
	hexID := repository.NewID()
	// Share ops are no longer ack-only — they require resource_id and resource_type.
	shareOps := []string{OpShare, OpRevokeShare, OpUpdateShare, OpCreateLink, OpRevokeLink}
	for _, opType := range shareOps {
		// Valid op with resource_id
		op := SyncOperation{
			OperationID:  repository.NewID(),
			ResourceID:   strp(hexID),
			ResourceType: strp("file"),
			Operation:    opType,
			Payload:      json.RawMessage(`{}`),
		}
		if err := validateSyncOp(&op); err != nil {
			t.Errorf("%s: op valide rejetée: %v", opType, err)
		}
		// Missing resource_id → rejected
		opNoRes := SyncOperation{
			OperationID: repository.NewID(),
			Operation:   opType,
			Payload:     json.RawMessage(`{}`),
		}
		if err := validateSyncOp(&opNoRes); err == nil {
			t.Errorf("%s: resource_id manquant attendu rejeté", opType)
		}
	}
}

func TestApplyBatchRejectsInvalidOperationID(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-invalid")
	deviceID := mustRegisterDevice(t, s.Repository, shareTestDeviceID)

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

func TestApplyBatchUpdateMetadata(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "sync-rename")
	deviceID := mustRegisterDevice(t, s.Repository, shareTestDeviceID)

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
	deviceID := mustRegisterDevice(t, s.Repository, shareTestDeviceID)

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
	deviceID := mustRegisterDevice(t, s.Repository, shareTestDeviceID)

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
	deviceID := mustRegisterDevice(t, s.Repository, shareTestDeviceID)

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
	deviceID := mustRegisterDevice(t, s.Repository, shareTestDeviceID)

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
	deviceID := mustRegisterDevice(t, s.Repository, shareTestDeviceID)

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

// --- Share & snapshot tests ---

func TestApplyShareAndSnapshot(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "share-owner")
	granteeID := mustCreateUser(t, s.Repository, "share-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	// Owner creates a file
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "shared.txt"}),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	// Owner shares with grantee
	result, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
		}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Fatalf("share: applied=%d failed=%+v", result.Applied, result.Failed)
	}

	// Grantee's snapshot includes the shared file
	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(perms) != 1 {
		t.Fatalf("attendu 1 permission, got %d", len(perms))
	}
	if perms[0].ResourceID != fileID {
		t.Errorf("resource_id = %s, attendu %s", perms[0].ResourceID, fileID)
	}
	if perms[0].EffectiveAccess != "viewer" {
		t.Errorf("effectiveAccess = %s, attendu viewer", perms[0].EffectiveAccess)
	}
	if perms[0].OwnerID != ownerID {
		t.Errorf("ownerId = %s, attendu %s", perms[0].OwnerID, ownerID)
	}
	if perms[0].SharedByID == nil || *perms[0].SharedByID != ownerID {
		t.Errorf("sharedById = %v, attendu %s", perms[0].SharedByID, ownerID)
	}
	if perms[0].Name != "shared.txt" {
		t.Errorf("name = %s, attendu shared.txt", perms[0].Name)
	}
}

func TestApplyShareGranteeNotFound(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "share-nograntee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	result, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": repository.NewID(),
			"access":        "viewer",
		}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "GRANTEE_NOT_FOUND" {
		t.Errorf("attendu GRANTEE_NOT_FOUND, got %+v", result)
	}
}

func TestApplyShareNotOwner(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "share-owner2")
	outsiderID := mustCreateUser(t, s.Repository, "share-outsider")
	granteeID := mustCreateUser(t, s.Repository, "share-grantee2")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	// Non-owner tries to share → NOT_FOUND (not enumeration)
	result, err := s.ApplyBatch(outsiderID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
		}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "NOT_FOUND" {
		t.Errorf("non-owner share: attendu NOT_FOUND, got %+v", result)
	}
}

func TestApplyRevokeShareStopsPropagation(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "revoke-owner")
	granteeID := mustCreateUser(t, s.Repository, "revoke-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
		}),
	}); err != nil {
		t.Fatalf("create+share: %v", err)
	}

	// Grantee sees it
	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(perms) != 1 {
		t.Fatalf("avant revoke: attendu 1, got %d", len(perms))
	}

	// Owner revokes
	result, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpRevokeShare, "file", map[string]any{
			"granteeUserId": granteeID,
		}),
	})
	if err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Fatalf("revoke result: %+v", result)
	}

	// Grantee no longer sees it
	perms, err = s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot après revoke: %v", err)
	}
	if len(perms) != 0 {
		t.Errorf("après revoke: attendu 0, got %d", len(perms))
	}
}

func TestApplyShareUpdatesLevel(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "upd-owner")
	granteeID := mustCreateUser(t, s.Repository, "upd-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
		}),
	}); err != nil {
		t.Fatalf("create+share: %v", err)
	}

	// Upgrade to editor
	result, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpUpdateShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
		}),
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Fatalf("update result: %+v", result)
	}

	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(perms) != 1 || perms[0].EffectiveAccess != "editor" {
		t.Errorf("après update: attendu editor, got %v", perms)
	}
}

func TestInheritedGrantDownTree(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "inherit-owner")
	granteeID := mustCreateUser(t, s.Repository, "inherit-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	// Create folder → subfolder → file
	parentID := repository.NewID()
	childID := repository.NewID()
	fileID := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpCreateResource, "folder", map[string]any{"name": "parent"}),
		syncOp(repository.NewID(), childID, OpCreateResource, "folder", map[string]any{"name": "child", "parentResourceId": parentID}),
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "file.txt", "parentResourceId": childID}),
	})
	if err != nil {
		t.Fatalf("create tree: %v", err)
	}

	// Share parent with inherit=true → grantee should see parent + child + file
	_, err = s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
			"inherit":       true,
		}),
	})
	if err != nil {
		t.Fatalf("share parent: %v", err)
	}

	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	ids := make(map[string]string)
	for _, p := range perms {
		ids[p.ResourceID] = p.EffectiveAccess
	}
	if _, ok := ids[parentID]; !ok {
		t.Error("parent absent du snapshot")
	}
	if _, ok := ids[childID]; !ok {
		t.Error("child absent du snapshot (inherit)")
	}
	if _, ok := ids[fileID]; !ok {
		t.Error("file absent du snapshot (inherit)")
	}
}

func TestInheritFalseBlocksPropagation(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "noinherit-owner")
	granteeID := mustCreateUser(t, s.Repository, "noinherit-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	parentID := repository.NewID()
	childID := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpCreateResource, "folder", map[string]any{"name": "parent"}),
		syncOp(repository.NewID(), childID, OpCreateResource, "folder", map[string]any{"name": "child", "parentResourceId": parentID}),
	})
	if err != nil {
		t.Fatalf("create tree: %v", err)
	}

	// Share parent with inherit=false → only parent visible
	inherit := false
	_, err = s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
			"inherit":       inherit,
		}),
	})
	if err != nil {
		t.Fatalf("share parent: %v", err)
	}

	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(perms) != 1 || perms[0].ResourceID != parentID {
		t.Errorf("inherit=false: attendu juste parent, got %d permissions", len(perms))
	}
}

func TestDirectGrantOnChildOverrides(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "direct-owner")
	granteeID := mustCreateUser(t, s.Repository, "direct-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	parentID := repository.NewID()
	childID := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpCreateResource, "folder", map[string]any{"name": "parent"}),
		syncOp(repository.NewID(), childID, OpCreateResource, "folder", map[string]any{"name": "child", "parentResourceId": parentID}),
	})
	if err != nil {
		t.Fatalf("create tree: %v", err)
	}

	// Share parent with viewer + inherit=true → child gets viewer via inherit
	_, err = s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
			"inherit":       true,
		}),
	})
	if err != nil {
		t.Fatalf("share parent: %v", err)
	}

	// Directly grant child with editor (higher) → child should show editor
	_, err = s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), childID, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
			"inherit":       false,
		}),
	})
	if err != nil {
		t.Fatalf("share child: %v", err)
	}

	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	byID := make(map[string]string)
	for _, p := range perms {
		byID[p.ResourceID] = p.EffectiveAccess
	}
	if byID[parentID] != "viewer" {
		t.Errorf("parent: attendu viewer, got %s", byID[parentID])
	}
	if byID[childID] != "editor" {
		t.Errorf("child: attendu editor (direct > inherited), got %s", byID[childID])
	}
}

func TestExpiredGrantIgnored(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "expired-owner")
	granteeID := mustCreateUser(t, s.Repository, "expired-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	// Share with an expiry in the past
	pastMs := time.Now().Add(-1 * time.Hour).UnixMilli()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
			"expiresAt":     pastMs,
		}),
	})
	if err != nil {
		t.Fatalf("share: %v", err)
	}

	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(perms) != 0 {
		t.Errorf("grant expiré: attendu 0 permissions, got %d", len(perms))
	}
}

func TestExpiredGrantDoesNotPropagate(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "expire-prop-owner")
	granteeID := mustCreateUser(t, s.Repository, "expire-prop-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	parentID := repository.NewID()
	childID := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpCreateResource, "folder", map[string]any{"name": "parent"}),
		syncOp(repository.NewID(), childID, OpCreateResource, "folder", map[string]any{"name": "child", "parentResourceId": parentID}),
	})
	if err != nil {
		t.Fatalf("create tree: %v", err)
	}

	pastMs := time.Now().Add(-1 * time.Hour).UnixMilli()
	_, err = s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
			"inherit":       true,
			"expiresAt":     pastMs,
		}),
	})
	if err != nil {
		t.Fatalf("share: %v", err)
	}

	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	// Neither parent nor child should appear (expired grant blocks propagation)
	if len(perms) != 0 {
		t.Errorf("grant expiré + inherit: attendu 0, got %d", len(perms))
	}
}

func TestSnapshotDelta(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "delta-owner")
	granteeID := mustCreateUser(t, s.Repository, "delta-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	// Full snapshot (afterMs=0) → empty
	perms, err := s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(perms) != 0 {
		t.Fatalf("attendu 0, got %d", len(perms))
	}

	// Share a file
	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "delta.txt"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
		}),
	}); err != nil {
		t.Fatalf("create+share: %v", err)
	}

	// Delta with afterMs in the far future → empty (resource not that new)
	futureMs := time.Now().Add(1 * time.Hour).UnixMilli()
	perms, err = s.Snapshot(granteeID, futureMs)
	if err != nil {
		t.Fatalf("Snapshot future: %v", err)
	}
	if len(perms) != 0 {
		t.Errorf("delta future: attendu 0, got %d", len(perms))
	}

	// Delta with afterMs=0 → includes the file
	perms, err = s.Snapshot(granteeID, 0)
	if err != nil {
		t.Fatalf("Snapshot full: %v", err)
	}
	if len(perms) != 1 {
		t.Errorf("delta full: attendu 1, got %d", len(perms))
	}
}

func TestShareLink(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "link-owner")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "linked.txt"}),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	token := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateLink, "file", map[string]any{
			"token":  token,
			"access": "viewer",
		}),
	})
	if err != nil {
		t.Fatalf("create link: %v", err)
	}

	// Resolve the link
	link, err := s.Repository.Shares.GetPublicLink(token)
	if err != nil {
		t.Fatalf("GetPublicLink: %v", err)
	}
	if link.ResourceID != fileID || link.Access != "viewer" || link.Name != "linked.txt" {
		t.Errorf("link: %+v", link)
	}
}

func TestRevokeLink(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "revoke-link-owner")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	token := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateLink, "file", map[string]any{
			"token":  token,
			"access": "viewer",
		}),
	})
	if err != nil {
		t.Fatalf("create link: %v", err)
	}

	// Revoke
	_, err = s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpRevokeLink, "file", map[string]any{
			"token": token,
		}),
	})
	if err != nil {
		t.Fatalf("revoke link: %v", err)
	}

	// No longer resolvable
	_, err = s.Repository.Shares.GetPublicLink(token)
	if !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("après revoke: attendu ErrNotFound, got %v", err)
	}
}

func TestShareInvalidAccessLevel(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "share-invalid-access")
	granteeID := mustCreateUser(t, s.Repository, "share-invalid-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	result, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "owner",
		}),
	})
	if err != nil {
		t.Fatalf("ApplyBatch: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "INVALID_REQUEST" {
		t.Errorf("access=owner: attendu INVALID_REQUEST, got %+v", result)
	}
}

func TestRevokeShareIsIdempotent(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "revoke-idempotent")
	granteeID := mustCreateUser(t, s.Repository, "revoke-idempotent-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "x.txt"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
		}),
	}); err != nil {
		t.Fatalf("create+share: %v", err)
	}

	// First revoke
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpRevokeShare, "file", map[string]any{
			"granteeUserId": granteeID,
		}),
	})
	if err != nil {
		t.Fatalf("revoke 1: %v", err)
	}

	// Second revoke (different operation_id) — idempotent, should succeed
	result, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpRevokeShare, "file", map[string]any{
			"granteeUserId": granteeID,
		}),
	})
	if err != nil {
		t.Fatalf("revoke 2: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Errorf("revoke idempotent: applied=%d failed=%+v", result.Applied, result.Failed)
	}
}

func TestOwnerDoesNotSeeSharesInSnapshot(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "own-snap-owner")
	granteeID := mustCreateUser(t, s.Repository, "own-snap-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	if _, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "own.txt"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
		}),
	}); err != nil {
		t.Fatalf("create+share: %v", err)
	}

	// Owner snapshot: only 1 (their own file, not duplicated by the share)
	perms, err := s.Snapshot(ownerID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(perms) != 1 {
		t.Fatalf("owner: attendu 1, got %d", len(perms))
	}
	if perms[0].EffectiveAccess != "owner" {
		t.Errorf("owner access = %s, attendu owner", perms[0].EffectiveAccess)
	}
}

// --- Phase 2 : enforcement lecture partagée + rename editor+ ---

func snapshotAccess(t *testing.T, s *Resources, userID string) map[string]string {
	t.Helper()
	perms, err := s.Snapshot(userID, 0)
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	byID := make(map[string]string, len(perms))
	for _, p := range perms {
		byID[p.ResourceID] = p.EffectiveAccess
	}
	return byID
}

func TestVisibleReadsIncludeSharedContent(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "vis-owner")
	granteeID := mustCreateUser(t, s.Repository, "vis-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	sharedRoot := repository.NewID()
	sharedSub := repository.NewID()
	sharedFile := repository.NewID()
	privateRoot := repository.NewID()
	privateFile := repository.NewID()

	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), sharedRoot, OpCreateResource, "folder", map[string]any{"name": "shared-root"}),
		syncOp(repository.NewID(), sharedSub, OpCreateResource, "folder", map[string]any{"name": "sub", "parentResourceId": sharedRoot}),
		syncOp(repository.NewID(), sharedFile, OpCreateResource, "file", map[string]any{"name": "shared-file.txt", "parentResourceId": sharedSub}),
		syncOp(repository.NewID(), privateRoot, OpCreateResource, "folder", map[string]any{"name": "private-root"}),
		syncOp(repository.NewID(), privateFile, OpCreateResource, "file", map[string]any{"name": "secret.txt", "parentResourceId": privateRoot}),
		syncOp(repository.NewID(), sharedRoot, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
			"inherit":       true,
		}),
	})
	if err != nil {
		t.Fatalf("create tree + share: %v", err)
	}

	// Grantee sees the shared root folder, not the private one.
	roots, err := s.Repo.ListRootFoldersVisible(granteeID)
	if err != nil {
		t.Fatalf("ListRootFoldersVisible: %v", err)
	}
	rootIDs := make(map[string]bool)
	for _, f := range roots {
		rootIDs[f.ID] = true
	}
	if !rootIDs[sharedRoot] || rootIDs[privateRoot] {
		t.Errorf("dossiers racines visibles: %v, attendu {shared-root} seulement", rootIDs)
	}

	// Grantee lists the shared file inside the shared subfolder.
	files, total, err := s.Repo.ListFilesVisible(granteeID, sharedSub, 50, 0, "created_at", "desc")
	if err != nil {
		t.Fatalf("ListFilesVisible: %v", err)
	}
	if total != 1 || len(files) != 1 || files[0].ID != sharedFile {
		t.Errorf("ListFilesVisible(sharedSub): total=%d files=%+v", total, files)
	}

	// Grantee does NOT see the private file inside the private folder.
	_, total, err = s.Repo.ListFilesVisible(granteeID, privateRoot, 50, 0, "created_at", "desc")
	if err != nil {
		t.Fatalf("ListFilesVisible(private): %v", err)
	}
	if total != 0 {
		t.Errorf("dossier privé: total=%d, attendu 0", total)
	}

	// GetFileVisible: shared ok, private → ErrNotFound.
	if f, err := s.Repo.GetFileVisible(granteeID, sharedFile); err != nil || f.Name != "shared-file.txt" {
		t.Errorf("GetFileVisible(shared): %+v err=%v", f, err)
	}
	if _, err := s.Repo.GetFileVisible(granteeID, privateFile); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("GetFileVisible(private): attendu ErrNotFound, got %v", err)
	}

	// SearchFilesVisible: shared matches, private does not.
	search, total, err := s.Repo.SearchFilesVisible(granteeID, "shared-file", 50, 0)
	if err != nil {
		t.Fatalf("SearchFilesVisible: %v", err)
	}
	if total != 1 || len(search) != 1 || search[0].ID != sharedFile {
		t.Errorf("SearchFilesVisible('shared-file'): total=%d files=%+v", total, search)
	}
	_, total, err = s.Repo.SearchFilesVisible(granteeID, "secret", 50, 0)
	if err != nil {
		t.Fatalf("SearchFilesVisible secret: %v", err)
	}
	if total != 0 {
		t.Errorf("recherche 'secret': total=%d, attendu 0", total)
	}
}

func TestEffectiveAccessInheritedFromParent(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "eff-owner")
	granteeID := mustCreateUser(t, s.Repository, "eff-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	parentID := repository.NewID()
	childID := repository.NewID()
	privateID := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), parentID, OpCreateResource, "folder", map[string]any{"name": "parent"}),
		syncOp(repository.NewID(), childID, OpCreateResource, "folder", map[string]any{"name": "child", "parentResourceId": parentID}),
		syncOp(repository.NewID(), privateID, OpCreateResource, "file", map[string]any{"name": "secret.txt"}),
		syncOp(repository.NewID(), parentID, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "editor",
			"inherit":       true,
		}),
	})
	if err != nil {
		t.Fatalf("create + share: %v", err)
	}

	// Child (no direct grant) inherits editor from the parent grant.
	ra, err := s.Repository.Shares.EffectiveAccess(granteeID, childID)
	if err != nil {
		t.Fatalf("EffectiveAccess child: %v", err)
	}
	if !ra.Accessible || ra.EffectiveRank != repository.AccessEditor {
		t.Errorf("child: attendu editor accessible, got %+v", ra)
	}

	// Private file: not accessible.
	ra, err = s.Repository.Shares.EffectiveAccess(granteeID, privateID)
	if err != nil {
		t.Fatalf("EffectiveAccess private: %v", err)
	}
	if ra.Accessible || ra.EffectiveRank != 0 {
		t.Errorf("private: attendu inaccessible, got %+v", ra)
	}

	// Direct viewer grant on the child is authoritative over the inherited editor.
	_, err = s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), childID, OpShare, "folder", map[string]any{
			"granteeUserId": granteeID,
			"access":        "viewer",
		}),
	})
	if err != nil {
		t.Fatalf("share child viewer: %v", err)
	}
	ra, err = s.Repository.Shares.EffectiveAccess(granteeID, childID)
	if err != nil {
		t.Fatalf("EffectiveAccess child 2: %v", err)
	}
	if !ra.Accessible || ra.EffectiveRank != repository.AccessViewer {
		t.Errorf("child après grant direct viewer: attendu viewer, got %+v", ra)
	}
}

func TestEffectiveAccessMaxInheritedChain(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "chain-owner")
	granteeID := mustCreateUser(t, s.Repository, "chain-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	g := repository.NewID()
	a := repository.NewID()
	b := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), g, OpCreateResource, "folder", map[string]any{"name": "G"}),
		syncOp(repository.NewID(), a, OpCreateResource, "folder", map[string]any{"name": "A", "parentResourceId": g}),
		syncOp(repository.NewID(), b, OpCreateResource, "folder", map[string]any{"name": "B", "parentResourceId": a}),
		// G: editor, inherit. A: viewer, inherit (exact-node authoritative).
		syncOp(repository.NewID(), g, OpShare, "folder", map[string]any{"granteeUserId": granteeID, "access": "editor", "inherit": true}),
		syncOp(repository.NewID(), a, OpShare, "folder", map[string]any{"granteeUserId": granteeID, "access": "viewer", "inherit": true}),
	})
	if err != nil {
		t.Fatalf("create + shares: %v", err)
	}

	// A keeps its own viewer (rule 2); B, with no direct grant, keeps the
	// highest inherited rank (rule 5): editor from G.
	for id, want := range map[string]int{g: repository.AccessEditor, a: repository.AccessViewer, b: repository.AccessEditor} {
		ra, err := s.Repository.Shares.EffectiveAccess(granteeID, id)
		if err != nil {
			t.Fatalf("EffectiveAccess %s: %v", id, err)
		}
		if !ra.Accessible || ra.EffectiveRank != want {
			t.Errorf("EffectiveAccess(%s) = %+v, attendu rank %d", id, ra, want)
		}
	}

	// The snapshot matches the per-resource check.
	byID := snapshotAccess(t, s, granteeID)
	if byID[g] != "editor" || byID[a] != "viewer" || byID[b] != "editor" {
		t.Errorf("snapshot chain = %v, attendu G=editor A=viewer B=editor", byID)
	}
}

func TestUpdateMetadataRequiresEditor(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "ren-owner")
	editorID := mustCreateUser(t, s.Repository, "ren-editor")
	viewerID := mustCreateUser(t, s.Repository, "ren-viewer")
	strangerID := mustCreateUser(t, s.Repository, "ren-stranger")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "orig.txt"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{"granteeUserId": editorID, "access": "editor"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{"granteeUserId": viewerID, "access": "viewer"}),
	})
	if err != nil {
		t.Fatalf("create + shares: %v", err)
	}

	// Editor renames successfully.
	result, err := s.ApplyBatch(editorID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpUpdateMetadata, "file", map[string]any{"name": "renamed.txt"}),
	})
	if err != nil {
		t.Fatalf("editor update: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Fatalf("editor update: applied=%d failed=%+v", result.Applied, result.Failed)
	}
	row, err := s.Repo.GetFile(ownerID, fileID)
	if err != nil || row.Name != "renamed.txt" {
		t.Errorf("après rename editor: %+v err=%v", row, err)
	}

	// Viewer rename is rejected (NOT_FOUND) and stops the batch.
	result, err = s.ApplyBatch(viewerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpUpdateMetadata, "file", map[string]any{"name": "hijack.txt"}),
	})
	if err != nil {
		t.Fatalf("viewer update: %v", err)
	}
	if result.Applied != 0 || result.Failed == nil || result.Failed.Code != "NOT_FOUND" {
		t.Errorf("viewer update: attendu applied=0 NOT_FOUND, got %+v", result)
	}

	// Stranger (no access) → no-op terminal (absent semantics), no failure.
	result, err = s.ApplyBatch(strangerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpUpdateMetadata, "file", map[string]any{"name": "sneak.txt"}),
	})
	if err != nil {
		t.Fatalf("stranger update: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Errorf("stranger update: attendu applied=1 aucun échec, got %+v", result)
	}
	row, err = s.Repo.GetFile(ownerID, fileID)
	if err != nil || row.Name != "renamed.txt" {
		t.Errorf("nom altéré par un tiers: %+v err=%v", row, err)
	}
}

func TestMoveAndDeleteOwnerOnly(t *testing.T) {
	s := newServiceStore(t)
	ownerID := mustCreateUser(t, s.Repository, "ownmove-owner")
	granteeID := mustCreateUser(t, s.Repository, "ownmove-grantee")
	mustRegisterDevice(t, s.Repository, shareTestDeviceID)

	fileID := repository.NewID()
	targetID := repository.NewID()
	_, err := s.ApplyBatch(ownerID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpCreateResource, "file", map[string]any{"name": "protected.txt"}),
		syncOp(repository.NewID(), targetID, OpCreateResource, "folder", map[string]any{"name": "target"}),
		syncOp(repository.NewID(), fileID, OpShare, "file", map[string]any{"granteeUserId": granteeID, "access": "editor"}),
	})
	if err != nil {
		t.Fatalf("create + share: %v", err)
	}

	// Editor tries to move the shared file → no-op (owner-only), nothing moves.
	result, err := s.ApplyBatch(granteeID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpMoveResource, "file", map[string]any{"toFolderResourceId": targetID}),
	})
	if err != nil {
		t.Fatalf("grantee move: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Fatalf("grantee move: applied=%d failed=%+v", result.Applied, result.Failed)
	}
	row, err := s.Repo.GetFile(ownerID, fileID)
	if err != nil {
		t.Fatalf("GetFile: %v", err)
	}
	if row.FolderID != "" {
		t.Errorf("fichier déplacé par un non-owner: folderId=%q, attendu racine", row.FolderID)
	}

	// Editor tries to delete the shared file → no-op, still present for owner.
	result, err = s.ApplyBatch(granteeID, shareTestDeviceID, []SyncOperation{
		syncOp(repository.NewID(), fileID, OpDeleteResource, "file", map[string]any{}),
	})
	if err != nil {
		t.Fatalf("grantee delete: %v", err)
	}
	if result.Applied != 1 || result.Failed != nil {
		t.Fatalf("grantee delete: applied=%d failed=%+v", result.Applied, result.Failed)
	}
	if _, err := s.Repo.GetFile(ownerID, fileID); err != nil {
		t.Errorf("fichier supprimé par un non-owner: %v", err)
	}
}
