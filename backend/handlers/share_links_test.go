package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/vaultdrop/backend/repository"
)

func TestShareLinkPublicResolution(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "sln"), "share-link-pw", device)

	// Owner creates a file + a share link via the outbox.
	fileID := repository.NewID()
	linkToken := repository.NewID()
	ops := []map[string]any{
		op(repository.NewID(), fileID, "create_resource", "file", map[string]any{"name": "public.pdf"}),
		op(repository.NewID(), fileID, "create_link", "file", map[string]any{"token": linkToken, "access": "viewer"}),
	}
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-ops-link")
	var result struct {
		Applied int `json:"applied"`
		Failed  any `json:"failed"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("sync-ops-link: unmarshal: %v", err)
	}
	if result.Applied != 2 || result.Failed != nil {
		t.Fatalf("attendu applied=2 failed=null, got %+v", result)
	}

	// Résolution publique, SANS token.
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/shares/links/"+linkToken, "", nil, "")
	env = expectOK(t, rec, "get-public-link")
	var link struct {
		Token        string `json:"token"`
		ResourceID   string `json:"resource_id"`
		ResourceType string `json:"resourceType"`
		Name         string `json:"name"`
		Access       string `json:"access"`
	}
	if err := json.Unmarshal(env.Data, &link); err != nil {
		t.Fatalf("get-public-link: unmarshal: %v", err)
	}
	if link.Token != linkToken || link.ResourceID != fileID || link.Name != "public.pdf" || link.Access != "viewer" || link.ResourceType != "file" {
		t.Errorf("lien résolu inattendu: %+v", link)
	}
}

func TestShareLinkRevokedNotFound(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "slr"), "share-link-pw", device)

	fileID := repository.NewID()
	linkToken := repository.NewID()
	ops := []map[string]any{
		op(repository.NewID(), fileID, "create_resource", "file", map[string]any{"name": "x.pdf"}),
		op(repository.NewID(), fileID, "create_link", "file", map[string]any{"token": linkToken, "access": "viewer"}),
		op(repository.NewID(), fileID, "revoke_link", "file", map[string]any{"token": linkToken}),
	}
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/sync/ops", token, syncOpsBody(ops), "application/json")
	env := expectOK(t, rec, "sync-ops-revoke-link")
	var result struct {
		Applied int `json:"applied"`
	}
	if err := json.Unmarshal(env.Data, &result); err != nil {
		t.Fatalf("sync-ops-revoke-link: unmarshal: %v", err)
	}
	if result.Applied != 3 {
		t.Fatalf("attendu applied=3, got %d", result.Applied)
	}

	// Lien révoqué → 404.
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/shares/links/"+linkToken, "", nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-revoked-link")
}

func TestShareLinkUnknownTokenNotFound(t *testing.T) {
	r, _, _ := setup(t)
	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/shares/links/"+repository.NewID(), "", nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-unknown-link")
}
