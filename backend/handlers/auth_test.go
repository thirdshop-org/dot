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
	"github.com/vaultdrop/backend/pkg/passwd"
	"github.com/vaultdrop/backend/repository"
	"github.com/vaultdrop/backend/service"
)

const authTestURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_handlers_auth_test?sslmode=disable"

const (
	authTestPassword = "vaultdrop-test-password"
	authTestDevice   = "0123456789abcdef0123456789abcdef"
)

func newTestRouterForAuth() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	RegisterRoutes(r)
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

func setTestAuth(t *testing.T) {
	t.Helper()
	Auth, _ = auth.NewManager("test-secret")
	t.Cleanup(func() { Auth = nil })
}

func createAdmin(t *testing.T, repo *repository.Repository, username, password string) string {
	t.Helper()
	hash, err := passwd.Hash(password)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	id, err := repo.Users.Create(service.NormalizeUsername(username), username, hash, true)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return id
}

func doAuth(t *testing.T, r *gin.Engine, method, path, token string, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

type loginEnvelope struct {
	Data struct {
		Token     string `json:"token"`
		ExpiresAt int64  `json:"expires_at"`
		User      struct {
			ID       string `json:"id"`
			Username string `json:"username"`
			IsAdmin  bool   `json:"is_admin"`
		} `json:"user"`
	} `json:"data"`
}

func loginOK(t *testing.T, r *gin.Engine, username, password, deviceID string) (string, string) {
	t.Helper()
	body := `{"username":` + mustJSON(username) + `,"password":` + mustJSON(password) + `,"device_id":` + mustJSON(deviceID) + `}`
	rec := doAuth(t, r, http.MethodPost, "/api/v1/auth/login", "", body)
	if rec.Code != 200 {
		t.Fatalf("login: status %d body %s", rec.Code, rec.Body.String())
	}
	var env loginEnvelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("login: unmarshal %v body %s", err, rec.Body.String())
	}
	if env.Data.Token == "" || env.Data.User.ID == "" {
		t.Fatalf("login: token/user manquants %s", rec.Body.String())
	}
	return env.Data.Token, env.Data.User.ID
}

func mustJSON(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func TestDevicesRegisterReturnsNoToken(t *testing.T) {
	setTestAuth(t)
	repo := setTestStore(t)

	rec := doAuth(t, newTestRouterForAuth(), http.MethodPost, "/api/v1/devices", "", `{"deviceId":"`+authTestDevice+`"}`)
	if rec.Code != 200 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if _, hasToken := env.Data["token"]; hasToken {
		t.Error("POST /devices ne doit plus émettre de token")
	}
	if env.Data["deviceId"] != authTestDevice {
		t.Errorf("deviceId = %v", env.Data["deviceId"])
	}

	exists, err := repo.Devices.Exists(authTestDevice)
	if err != nil || !exists {
		t.Fatalf("device non persisté: exists=%v err=%v", exists, err)
	}
}

func TestDevicesRegisterRejectsBadDeviceID(t *testing.T) {
	setTestAuth(t)
	setTestStore(t)

	rec := doAuth(t, newTestRouterForAuth(), http.MethodPost, "/api/v1/devices", "", `{"deviceId":"UPPERCASEANDTOOLONG"}`)
	if rec.Code != 400 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestRequireAuthRejectsMissingToken(t *testing.T) {
	setTestAuth(t)
	setTestStore(t)

	rec := doAuth(t, newTestRouterForAuth(), http.MethodGet, "/api/v1/files", "", "")
	if rec.Code != 401 {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestAuthLoginFlow(t *testing.T) {
	setTestAuth(t)
	repo := setTestStore(t)
	adminID := createAdmin(t, repo, "admin", authTestPassword)
	r := newTestRouterForAuth()

	// Enregistrement du device puis login → token utilisable
	rec := doAuth(t, r, http.MethodPost, "/api/v1/devices", "", `{"deviceId":"`+authTestDevice+`"}`)
	if rec.Code != 200 {
		t.Fatalf("register: status %d", rec.Code)
	}

	token, userID := loginOK(t, r, "admin", authTestPassword, authTestDevice)
	if userID != adminID {
		t.Errorf("login user.id = %q, want %q", userID, adminID)
	}

	// Le token fonctionne sur un endpoint protégé
	rec = doAuth(t, r, http.MethodGet, "/api/v1/files", token, "")
	if rec.Code != 200 {
		t.Errorf("files protégé avec token = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestAuthLoginWrongCredentials(t *testing.T) {
	setTestAuth(t)
	repo := setTestStore(t)
	createAdmin(t, repo, "admin", authTestPassword)
	r := newTestRouterForAuth()

	doAuth(t, r, http.MethodPost, "/api/v1/devices", "", `{"deviceId":"`+authTestDevice+`"}`)

	// Mauvais mot de passe
	rec := doAuth(t, r, http.MethodPost, "/api/v1/auth/login", "", `{"username":"admin","password":"wrong-password","device_id":"`+authTestDevice+`"}`)
	if rec.Code != 401 {
		t.Fatalf("mauvais mot de passe: status %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "UNAUTHORIZED") {
		t.Errorf("code attendu UNAUTHORIZED, got %s", rec.Body.String())
	}

	// Username inconnu → MÊME réponse (indistinguable)
	rec2 := doAuth(t, r, http.MethodPost, "/api/v1/auth/login", "", `{"username":"ghost","password":"wrong-password","device_id":"`+authTestDevice+`"}`)
	if rec2.Code != 401 {
		t.Fatalf("username inconnu: status %d body %s", rec2.Code, rec2.Body.String())
	}
	if rec.Body.String() != rec2.Body.String() {
		t.Errorf("réponses distinguables (sécurité):\n%q\n%q", rec.Body.String(), rec2.Body.String())
	}
}

func TestAuthLoginUnregisteredDevice(t *testing.T) {
	setTestAuth(t)
	repo := setTestStore(t)
	createAdmin(t, repo, "admin", authTestPassword)
	r := newTestRouterForAuth()

	rec := doAuth(t, r, http.MethodPost, "/api/v1/auth/login", "", `{"username":"admin","password":"`+authTestPassword+`","device_id":"`+authTestDevice+`"}`)
	if rec.Code != 400 {
		t.Fatalf("device non enregistré: status %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "INVALID_DEVICE_ID") {
		t.Errorf("code attendu INVALID_DEVICE_ID, got %s", rec.Body.String())
	}
}

func TestRequireAuthRejectsTokenForDeletedAccount(t *testing.T) {
	setTestAuth(t)
	repo := setTestStore(t)
	userID := createAdmin(t, repo, "admin", authTestPassword)
	_ = repo.Devices.Upsert(authTestDevice)
	_ = repo.Devices.MarkUser(authTestDevice, userID)
	r := newTestRouterForAuth()

	signed, _ := Auth.Issue(userID, authTestDevice)
	requireAdmin(t, r, signed)

	// Suppression du compte → le token ne passe plus le middleware
	if err := repo.Users.MarkDeleted(userID); err != nil {
		t.Fatalf("mark deleted: %v", err)
	}
	rec := doAuth(t, r, http.MethodGet, "/api/v1/files", signed, "")
	if rec.Code != 401 {
		t.Errorf("compte supprimé: status attendu 401, got %d body %s", rec.Code, rec.Body.String())
	}
}

func requireAdmin(t *testing.T, r *gin.Engine, token string) {
	t.Helper()
	rec := doAuth(t, r, http.MethodGet, "/api/v1/files", token, "")
	if rec.Code == 401 {
		t.Fatalf("token valide rejeté: %s", rec.Body.String())
	}
}

func TestChangePassword(t *testing.T) {
	setTestAuth(t)
	repo := setTestStore(t)
	createAdmin(t, repo, "admin", authTestPassword)
	_ = repo.Devices.Upsert(authTestDevice)

	r := newTestRouterForAuth()
	token, _ := loginOK(t, r, "admin", authTestPassword, authTestDevice)

	// Mauvais mot de passe courant → 403
	rec := doAuth(t, r, http.MethodPatch, "/api/v1/users/me/password", token, `{"current_password":"nope","new_password":"new-secret-123"}`)
	if rec.Code != 403 {
		t.Fatalf("mauvais current_password: status %d body %s", rec.Code, rec.Body.String())
	}

	// Méthode non autorisée ayant échouée → 403 ne doit PAS confirmer le compte
	if !strings.Contains(rec.Body.String(), "INVALID_PASSWORD") {
		t.Errorf("code INVALID_PASSWORD attendu, got %s", rec.Body.String())
	}

	// Changement valide
	rec = doAuth(t, r, http.MethodPatch, "/api/v1/users/me/password", token, `{"current_password":"`+authTestPassword+`","new_password":"new-secret-123"}`)
	if rec.Code != 200 {
		t.Fatalf("change password: status %d body %s", rec.Code, rec.Body.String())
	}

	// L'ancien mot de passe ne passe plus…
	rec = doAuth(t, r, http.MethodPost, "/api/v1/auth/login", "", `{"username":"admin","password":"`+authTestPassword+`","device_id":"`+authTestDevice+`"}`)
	if rec.Code != 401 {
		t.Errorf("ancien mdp encore accepté: status %d", rec.Code)
	}

	// … et le nouveau donne un token (tokens précédents restent valides : limite V1)
	rec = doAuth(t, r, http.MethodPost, "/api/v1/auth/login", "", `{"username":"admin","password":"new-secret-123","device_id":"`+authTestDevice+`"}`)
	if rec.Code != 200 {
		t.Errorf("nouveau mdp refusé: status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestResolveUser(t *testing.T) {
	setTestAuth(t)
	repo := setTestStore(t)
	createAdmin(t, repo, "admin", authTestPassword)
	createAdmin(t, repo, "alice", authTestPassword)
	_ = repo.Devices.Upsert(authTestDevice)
	_ = repo.Devices.MarkUser(authTestDevice, "admin")
	r := newTestRouterForAuth()
	token, _ := loginOK(t, r, "admin", authTestPassword, authTestDevice)

	// Résolution exacte, insensible à la casse / aux espaces (%20 décodé puis trim)
	rec := doAuth(t, r, http.MethodGet, "/api/v1/users/resolve?username=ALICE%20", token, "")
	if rec.Code != 200 {
		t.Fatalf("resolve: status %d body %s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			ID       string `json:"id"`
			Username string `json:"username"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Data.Username != "alice" {
		t.Errorf("resolve: %+v", env.Data)
	}
	// Jamais email ni is_admin
	if len(rec.Body.Bytes()) < 0 || strings.Contains(rec.Body.String(), "is_admin") || strings.Contains(rec.Body.String(), "email") {
		t.Error("resolve ne doit pas exposer email/is_admin")
	}

	// Inconnu → 404
	rec = doAuth(t, r, http.MethodGet, "/api/v1/users/resolve?username=ghost", token, "")
	if rec.Code != 404 {
		t.Errorf("resolve inconnu: status %d", rec.Code)
	}

	// Sans token → 401
	rec = doAuth(t, r, http.MethodGet, "/api/v1/users/resolve?username=admin", "", "")
	if rec.Code != 401 {
		t.Errorf("resolve sans token: status %d", rec.Code)
	}
}
