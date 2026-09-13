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

func op(operationID string, resourceID, operation, resourceType string, payload map[string]any) map[string]any {
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
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "sa"), "sync-test-password", device)

	folderID := repository.NewID()
	fileID := repository.NewID()
	ops := []map[string]any{
		op(repository.NewID(), folderID, "create_resource", "folder", map[string]any{"name": "Docs"}),
		op(repository.NewID(), fileID, "create_resource", "file", map[string]any{"name": "note.txt"}),
		op(repository.NewID(), fileID, "move_resource", "file", map[string]any{"toFolderResourceId": folderID}),
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

func TestSyncOpsCreateResourceWithParent(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "scp"), "sync-test-password", device)

	parentID := repository.NewID()
	childFolderID := repository.NewID()
	fileID := repository.NewID()
	ops := []map[string]any{
		op(repository.NewID(), parentID, "create_resource", "folder", map[string]any{"name": "Docs"}),
		op(repository.NewID(), childFolderID, "create_resource", "folder", map[string]any{"name": "Sub", "parentResourceId": parentID}),
		op(repository.NewID(), fileID, "create_resource", "file", map[string]any{"name": "note.txt", "parentResourceId": parentID}),
	}

	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-ops-parent")
	var result struct {
		Applied int `json:"applied"`
		Failed  any `json:"failed"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, rec.Body.String())
	}
	if result.Applied != 3 || result.Failed != nil {
		t.Errorf("attendu applied=3 failed=null, got %+v", result)
	}

	// Le fichier est classé sous parentID (pas à la racine)
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+fileID, token, nil, "")
	env = expectOK(t, rec, "get-after-sync-parent")
	var got fileDTO
	if err := json.Unmarshal(env.Data, &got); err != nil {
		t.Fatalf("get-after-sync-parent: unmarshal: %v", err)
	}
	if got.FolderID != parentID {
		t.Errorf("fichier attendu sous parentID=%s, got FolderID=%q", parentID, got.FolderID)
	}

	// Parent inexistant → NOT_FOUND, aucune ressource créée
	missingParent := repository.NewID()
	orphanID := repository.NewID()
	orphanOpID := repository.NewID()
	rec, _ = doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token,
		syncOpsBody([]map[string]any{
			op(orphanOpID, orphanID, "create_resource", "file", map[string]any{"name": "ghost.txt", "parentResourceId": missingParent}),
		}), "application/json")
	env = expectOK(t, rec, "sync-ops-missing-parent")
	var failed struct {
		Applied int `json:"applied"`
		Failed  *struct {
			OperationID string `json:"operation_id"`
			Code        string `json:"code"`
		} `json:"failed"`
	}
	if err := json.Unmarshal(env.Data, &failed); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, rec.Body.String())
	}
	if failed.Applied != 0 || failed.Failed == nil || failed.Failed.OperationID != orphanOpID || failed.Failed.Code != "NOT_FOUND" {
		t.Errorf("attendu applied=0 NOT_FOUND, got %+v", failed)
	}

	// La ressource orpheline n'existe pas ; le dossier enfant est parenté à parentID.
	if _, err := repo.Resources.GetFile(user, orphanID); err != repository.ErrNotFound {
		t.Errorf("la ressource orpheline ne doit pas exister, err=%v", err)
	}
	child, err := repo.Resources.GetFolder(user, childFolderID)
	if err != nil {
		t.Fatalf("GetFolder enfant: %v", err)
	}
	if child.ParentID != parentID {
		t.Errorf("dossier enfant attendu parentID=%s, got %q", parentID, child.ParentID)
	}
}

func TestSyncOpsRejectsMalformedBody(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "sm"), "sync-test-password", device)

	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, []byte(`{invalid`), "application/json")
	expectError(t, rec, http.StatusBadRequest, "INVALID_REQUEST", "sync-malformed")
}

func TestSyncOpsEmptyBatch(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "se"), "sync-test-password", device)

	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(nil), "application/json")
	env := expectOK(t, rec, "sync-empty")
	var result struct {
		Applied int `json:"applied"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if result.Applied != 0 {
		t.Errorf("batch vide: applied attendu 0, got %d", result.Applied)
	}
}

func TestSyncOpsReplayCreateIsNoop(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "srn"), "sync-test-password", device)

	fileID := repository.NewID()

	send := func(batch []map[string]any) int {
		t.Helper()
		rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(batch), "application/json")
		env := expectOK(t, rec, "sync-send")
		var result struct {
			Applied int `json:"applied"`
		}
		if err := json.Unmarshal(env.Data, &result); err != nil {
			t.Fatalf("unmarshal: %v body=%s", err, rec.Body.String())
		}
		return result.Applied
	}

	ops := []map[string]any{
		op(repository.NewID(), fileID, "create_resource", "file", map[string]any{"name": "note.txt"}),
	}
	if applied := send(ops); applied != 1 {
		t.Fatalf("premier envoi: applied attendu 1, got %d", applied)
	}

	// Rejeu avec le MÊME resource_id mais un operation_id neuf → idempotent
	// (la ressource existe déjà : no-op), pas de doublon côté ressources.
	if applied := send([]map[string]any{
		op(repository.NewID(), fileID, "create_resource", "file", map[string]any{"name": "note.txt"}),
	}); applied != 1 {
		t.Fatalf("rejeu: applied attendu 1, got %d", applied)
	}

	files, total, err := repo.Resources.ListFiles(user, "", 10, 0, "created_at", "desc")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 1 || len(files) != 1 || files[0].ID != fileID {
		t.Errorf("pas de doublon attendu: total=%d files=%+v", total, files)
	}
}

func TestSyncOpsLargeBatchAccepted(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "sl"), "sync-test-password", device)

	ops := make([]map[string]any, 0, 25)
	for i := 0; i < 25; i++ {
		ops = append(ops, op(repository.NewID(), repository.NewID(), "create_resource", "file", map[string]any{"name": fmt.Sprintf("f%02d.txt", i)}))
	}

	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-large")
	var result struct {
		Applied int `json:"applied"`
		Failed  any `json:"failed"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if result.Applied != 25 || result.Failed != nil {
		t.Errorf("attendu applied=25 failed=null, got %+v", result)
	}

	files, total, err := repo.Resources.ListFiles(user, "", 50, 0, "created_at", "desc")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 25 || len(files) != 25 {
		t.Errorf("les 25 ressources doivent être persistées, total=%d files=%d", total, len(files))
	}
}

func TestSyncOpsStopsAtFirstNonIdempotentFailure(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "sb"), "sync-test-password", device)

	folderID := repository.NewID()
	dupeID := repository.NewID()
	dupeOpID := repository.NewID()
	ops := []map[string]any{
		op(repository.NewID(), folderID, "create_resource", "folder", map[string]any{"name": "Docs"}),
		// Conflicte avec Docs (même parent racine, même nom)
		op(dupeOpID, dupeID, "create_resource", "folder", map[string]any{"name": "Docs"}),
		op(repository.NewID(), repository.NewID(), "create_resource", "file", map[string]any{"name": "after.txt"}),
	}

	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-ops-fail")
	var result struct {
		Applied int `json:"applied"`
		Failed  *struct {
			OperationID string `json:"operation_id"`
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
	if result.Failed == nil || result.Failed.OperationID != dupeOpID || result.Failed.Code != "NAME_CONFLICT" {
		t.Errorf("failed attendu op %s NAME_CONFLICT, got %+v", dupeOpID, result.Failed)
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
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "sc"), "sync-test-password", device)

	fileID := repository.NewID()
	if err := repo.Resources.InsertFile(user, fileID, "x.txt", "", 1, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}

	// Supprimer une ressource absente → no-op réussi (pas de dead-letter)
	absent := repository.NewID()
	ops := []map[string]any{
		op(repository.NewID(), fileID, "delete_resource", "file", map[string]any{}),
		op(repository.NewID(), absent, "delete_resource", "file", map[string]any{}),
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
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "sd"), "sync-test-password", device)

	folderID := repository.NewID()
	if err := repo.Resources.InsertFolder(user, folderID, "Docs", ""); err != nil {
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
	if len(perms) != 1 || perms[0].ResourceID != folderID || perms[0].EffectiveAccess != "owner" || perms[0].OwnerID != user {
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
