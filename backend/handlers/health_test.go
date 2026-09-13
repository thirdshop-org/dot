package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestHealth(t *testing.T) {
	r, _, _ := setup(t)
	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/health", "", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("health: status %d body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("health: unmarshal: %v", err)
	}
	if env.Data.Status != "healthy" {
		t.Errorf("health status = %q, attendu healthy", env.Data.Status)
	}
}

func TestUnknownRouteReturnsJsonEnvelope(t *testing.T) {
	r, _, _ := setup(t)
	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/does-not-exist", "", nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "unknown-route")
}
