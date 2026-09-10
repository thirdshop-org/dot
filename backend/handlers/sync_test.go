package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/vaultdrop/backend/repository"
)

func syncOpsBody(ops []map[string]any) []byte {
	body, _ := json.Marshal(map[string]any{"operations": ops})
	return body
}

func op(operationID int64, resourceID, operation, resourceType string, payload map[string]any) map[string]any {
	return map[string]any{
		"operation_id":  operationID,
		"ref_type":      "resource",
		"resource_id":   resourceID,
		"resource_type": resourceType,
		"operation":     operation,
		"payload":       payload,
	}
}

func TestSyncOpsApplySequential(t *testing.T) {
	r, _, _ := setup(t)
	device := repository.NewID()
	token := registerDevice(t, r, device)

	folderID := repository.NewID()
	fileID := repository.NewID()
	ops := []map[string]any{
		op(1, folderID, "create_resource", "folder", map[string]any{"name": "Docs"}),
		op(2, fileID, "create_resource", "file", map[string]any{"name": "note.txt"}),
		op(3, fileID, "move_resource", "file", map[string]any{"toFolderResourceId": folderID}),
	}

	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-ops")
	var result struct {
		Applied int `json:"applied"`
		Failed  any `json:"failed"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("sync-ops: unmarshal: %v", err)
	}
	if result.Applied != 3 || result.Failed != nil {
		t.Errorf("attendu applied=3 failed=null, got %+v", result)
	}

	// L'effet est visible côté CRUD
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+fileID, token, nil, "")
	env = expectOK(t, rec, "get-after-sync")
	var got fileDTO
	if err := json.Unmarshal(env.Data, &got); err != nil {
		t.Fatalf("get-after-sync: unmarshal: %v", err)
	}
	if got.Name != "note.txt" || got.FolderID != folderID {
		t.Errorf("fichier syncé: %+v", got)
	}

	// Re-envoi (retry) → idempotent, no-op
	rec, _ = doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env = expectOK(t, rec, "sync-ops-retry")
	result = struct {
		Applied int `json:"applied"`
		Failed  any `json:"failed"`
	}{}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("retry: unmarshal: %v", err)
	}
	if result.Applied != 3 {
		t.Errorf("retry attendu applied=3, got %d", result.Applied)
	}
}

func TestSyncOpsStopsAtFirstNonIdempotentFailure(t *testing.T) {
	r, _, _ := setup(t)
	device := repository.NewID()
	token := registerDevice(t, r, device)

	folderID := repository.NewID()
	dupeID := repository.NewID()
	ops := []map[string]any{
		op(10, folderID, "create_resource", "folder", map[string]any{"name": "Docs"}),
		// Conflicte avec Docs (même parent racine, même nom)
		op(11, dupeID, "create_resource", "folder", map[string]any{"name": "Docs"}),
		op(12, repository.NewID(), "create_resource", "file", map[string]any{"name": "after.txt"}),
	}

	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-ops-fail")
	var result struct {
		Applied int `json:"applied"`
		Failed  *struct {
			OperationID int64  `json:"operation_id"`
			Code        string `json:"code"`
			Message     string `json:"message"`
		} `json:"failed"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, rec.Body.String())
	}
	if result.Applied != 1 {
		t.Errorf("attendu applied=1 (arrêt à la 2e op), got %d", result.Applied)
	}
	if result.Failed == nil || result.Failed.OperationID != 11 || result.Failed.Code != "NAME_CONFLICT" {
		t.Errorf("failed attendu op 11 NAME_CONFLICT, got %+v", result.Failed)
	}

	// L'op 12 n'a PAS été appliquée
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files", token, nil, "")
	env = expectOK(t, rec, "list-after-fail")
	var files []fileDTO
	if err := json.Unmarshal(env.Data, &files); err != nil {
		t.Fatalf("list-after-fail: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("op 12 ne doit pas être appliquée: %+v", files)
	}
}

func TestSyncOpsDeleteIdempotent(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token := registerDevice(t, r, device)

	fileID := repository.NewID()
	if err := repo.Resources.InsertFile(device, fileID, "x.txt", "", 1, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}

	// Supprimer une ressource absente → no-op réussi (pas de dead-letter)
	absent := repository.NewID()
	ops := []map[string]any{
		op(20, fileID, "delete_resource", "file", map[string]any{}),
		op(21, absent, "delete_resource", "file", map[string]any{}),
	}
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-delete")
	var result struct {
		Applied int `json:"applied"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if result.Applied != 2 {
		t.Errorf("attendu applied=2, got %d", result.Applied)
	}
}

func TestSnapshotPermissions(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token := registerDevice(t, r, device)

	folderID := repository.NewID()
	if err := repo.Resources.InsertFolder(device, folderID, "Docs", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}

	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/sync/permissions", token, nil, "")
	env := expectOK(t, rec, "snapshot")
	var perms []struct {
		ResourceID      string `json:"resource_id"`
		ResourceType    string `json:"resourceType"`
		EffectiveAccess string `json:"effectiveAccess"`
		OwnerID         string `json:"ownerId"`
		CachedAt        int64  `json:"cachedAt"`
	}
	if err := json.Unmarshal(env.Data, &perms); err != nil {
		t.Fatalf("snapshot: unmarshal: %v", err)
	}
	if len(perms) != 1 || perms[0].ResourceID != folderID || perms[0].EffectiveAccess != "owner" || perms[0].OwnerID != device {
		t.Errorf("snapshot: %+v", perms)
	}
	if perms[0].CachedAt == 0 {
		t.Error("cachedAt manquant")
	}

	// Delta : après cachedAt → vide
	rec, _ = doRequest(t, r, http.MethodGet, fmt.Sprintf("/api/v1/sync/permissions?after=%d", perms[0].CachedAt), token, nil, "")
	env = expectOK(t, rec, "snapshot-after")
	perms = nil
	if err := json.Unmarshal(env.Data, &perms); err != nil {
		t.Fatalf("snapshot-after: unmarshal: %v", err)
	}
	if len(perms) != 0 {
		t.Errorf("delta attendu vide, got %+v", perms)
	}
}
