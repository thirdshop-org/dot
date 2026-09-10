package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/auth"
)

func newTestRouterForAuth() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/devices", DevicesRegister)
	grp := r.Group("")
	grp.Use(RequireDevice)
	grp.GET("/files", FilesList)
	return r
}

func TestDevicesRegisterValid(t *testing.T) {
	m, _ := auth.NewManager("test-secret")
	Auth = m
	defer func() { Auth = nil }()

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

	// FilesList is still a 501 stub — the point is it got past the middleware.
	if rec.Code != 501 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}
