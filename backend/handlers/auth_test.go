package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/dbtest"
	"github.com/vaultdrop/backend/pkg/auth"
	"github.com/vaultdrop/backend/repository"
	"github.com/vaultdrop/backend/service"
)

const authTestURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_handlers_auth_test?sslmode=disable"

func newTestRouterForAuth() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/devices", DevicesRegister)
	grp := r.Group("")
	grp.Use(RequireDevice)
	grp.GET("/files", FilesList)
	return r
}

func setTestStore(t *testing.T) *repository.Repository {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, authTestURL)
	repo := repository.NewRepository(conn)
	Store = service.NewResources(repo, t.TempDir(), 1_048_576)
	t.Cleanup(func() { Store = nil })
	return repo
}

func TestDevicesRegisterValid(t *testing.T) {
	m, _ := auth.NewManager("test-secret")
	Auth = m
	defer func() { Auth = nil }()
	repo := setTestStore(t)

	deviceID := "0123456789abcdef0123456789abcdef"
	body := `{"deviceId":"` + deviceID + `"}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/devices", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	newTestRouterForAuth().ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}

	var envelope struct {
		Data struct {
			DeviceID string `json:"deviceId"`
			Token    string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if envelope.Data.DeviceID != deviceID {
		t.Errorf("deviceId = %q", envelope.Data.DeviceID)
	}

	verified, err := m.Verify(envelope.Data.Token)
	if err != nil || verified != deviceID {
		t.Errorf("token invalid: %v", err)
	}

	// Le device est bien persisté (requis par les FK resources.owner_id).
	exists, err := repo.Devices.Exists(deviceID)
	if err != nil || !exists {
		t.Errorf("device non persisté: exists=%v err=%v", exists, err)
	}
}

func TestDevicesRegisterRejectsBadDeviceID(t *testing.T) {
	Auth, _ = auth.NewManager("test-secret")
	defer func() { Auth = nil }()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/devices", strings.NewReader(`{"deviceId":"UPPERCASEANDTOOLONG"}`))
	req.Header.Set("Content-Type", "application/json")
	newTestRouterForAuth().ServeHTTP(rec, req)

	if rec.Code != 400 {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRequireDeviceRejectsMissingToken(t *testing.T) {
	Auth, _ = auth.NewManager("test-secret")
	defer func() { Auth = nil }()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/files", nil)
	newTestRouterForAuth().ServeHTTP(rec, req)

	if rec.Code != 401 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestRequireDeviceAcceptsValidToken(t *testing.T) {
	Auth, _ = auth.NewManager("test-secret")
	defer func() { Auth = nil }()

	deviceID := "0123456789abcdef0123456789abcdef"
	signed, err := Auth.Issue(deviceID)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/files", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	newTestRouterForAuth().ServeHTTP(rec, req)

	// Sans Store le handler répond SERVICE_UNAVAILABLE (503) — le point est
	// que la requête a dépassé le middleware (jamais 401).
	if rec.Code == 401 {
		t.Fatalf("middleware a rejeté un token valide: %s", rec.Body.String())
	}
}
