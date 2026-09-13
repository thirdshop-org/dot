package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/dbtest"
	"github.com/vaultdrop/backend/handlers"
	"github.com/vaultdrop/backend/pkg/auth"
	"github.com/vaultdrop/backend/pkg/passwd"
	"github.com/vaultdrop/backend/repository"
	"github.com/vaultdrop/backend/service"
)

const handlersTestURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_handlers_test?sslmode=disable"

type envelope struct {
	Data json.RawMessage `json:"data"`
	Meta *struct {
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
		Total    int `json:"total"`
	} `json:"meta,omitempty"`
}

type fileDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	MimeType  string `json:"mimeType"`
	FolderID  string `json:"folderId"`
	CreatedAt string `json:"createdAt"`
}

type apiError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// wrapperError réutilise apiError pour casser l'imbrication.
func errorCode(rec *httptest.ResponseRecorder) string {
	var e apiError
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		return "<unmarshal: " + err.Error() + ">"
	}
	return e.Error.Code
}

func setup(t *testing.T) (*gin.Engine, *service.Resources, *repository.Repository) {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, handlersTestURL)
	repo := repository.NewRepository(conn)
	// max 10 bytes pour couvrir FILE_TOO_LARGE en test
	store := service.NewResources(repo, t.TempDir(), 10)

	manager, err := auth.NewManager("test-secret")
	if err != nil {
		t.Fatalf("auth manager: %v", err)
	}
	handlers.Auth = manager
	handlers.Store = store

	gin.SetMode(gin.TestMode)
	r := gin.New()
	handlers.RegisterRoutes(r)
	return r, store, repo
}

func doRequest(t *testing.T, r *gin.Engine, method, path, token string, body []byte, contentType string) (*httptest.ResponseRecorder, envelope) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec, envelope{}
}

func expectOK(t *testing.T, rec *httptest.ResponseRecorder, path string) envelope {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("%s: attendu 200, got %d body=%s", path, rec.Code, rec.Body.String())
	}
	var env envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("%s: unmarshal: %v body=%s", path, err, rec.Body.String())
	}
	return env
}

func expectError(t *testing.T, rec *httptest.ResponseRecorder, status int, code, path string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("%s: attendu %d, got %d body=%s", path, status, rec.Code, rec.Body.String())
	}
	if got := errorCode(rec); got != code {
		t.Errorf("%s: code erreur attendu %s, got %s (body=%s)", path, code, got, rec.Body.String())
	}
}

func registerAndLogin(t *testing.T, r *gin.Engine, repo *repository.Repository, username, password, deviceID string) (token, userID string) {
	t.Helper()
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/devices", "", []byte(fmt.Sprintf(`{"deviceId":%q}`, deviceID)), "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("register: status %d body=%s", rec.Code, rec.Body.String())
	}

	username = service.NormalizeUsername(username)
	if _, err := repo.Users.GetByUsernameNormalized(username); err == repository.ErrNotFound {
		hash, herr := passwd.Hash(password)
		if herr != nil {
			t.Fatalf("hash: %v", herr)
		}
		if _, cerr := repo.Users.Create(username, username, hash, false); cerr != nil {
			t.Fatalf("create user: %v", cerr)
		}
	} else if err != nil {
		t.Fatalf("get user: %v", err)
	}

	body := fmt.Sprintf(`{"username":%q,"password":%q,"device_id":%q}`, username, password, deviceID)
	rec, _ = doRequest(t, r, http.MethodPost, "/api/v1/auth/login", "", []byte(body), "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("login: status %d body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			Token string `json:"token"`
			User  struct {
				ID string `json:"id"`
			} `json:"user"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("login: unmarshal: %v body=%s", err, rec.Body.String())
	}
	if env.Data.Token == "" || env.Data.User.ID == "" {
		t.Fatalf("login: token/user manquant %s", rec.Body.String())
	}
	return env.Data.Token, env.Data.User.ID
}

// testUserUsername fournit un username unique par device (les bases de test
// sont reset, mais deux devices d'un même test ne doivent pas partager un
// compte).
func testUserUsername(deviceID, suffix string) string {
	return "u" + suffix + "-" + deviceID[:8]
}

func uploadMultipart(t *testing.T, r *gin.Engine, token, folderID, filename string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write body: %v", err)
	}
	if folderID != "" {
		if err := writer.WriteField("folderId", folderID); err != nil {
			t.Fatalf("write folderId: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/files/upload", token, body.Bytes(), writer.FormDataContentType())
	return rec
}

func TestFilesFlow(t *testing.T) {
	r, _, repo := setup(t)
	deviceA := repository.NewID()
	deviceB := repository.NewID()
	passA := "files-test-password-a"
	passB := "files-test-password-b"
	tokenA, userA := registerAndLogin(t, r, repo, testUserUsername(deviceA, "a"), passA, deviceA)
	tokenB, userB := registerAndLogin(t, r, repo, testUserUsername(deviceB, "b"), passB, deviceB)

	folderID := repository.NewID()
	if err := repo.Resources.InsertFolder(userA, folderID, "Docs", ""); err != nil {
		t.Fatalf("insert root folder: %v", err)
	}

	// Upload root + dossier
	rec := uploadMultipart(t, r, tokenA, "", "hello.txt", []byte("hello"))
	env := expectOK(t, rec, "upload")
	var uploaded fileDTO
	if err := json.Unmarshal(env.Data, &uploaded); err != nil {
		t.Fatalf("upload: unmarshal: %v", err)
	}
	if uploaded.Name != "hello.txt" || uploaded.Size != 5 || uploaded.FolderID != "" || uploaded.ID == "" {
		t.Errorf("FileDto inattendu: %+v", uploaded)
	}

	rec = uploadMultipart(t, r, tokenA, folderID, "doc.txt", []byte("doc"))
	env = expectOK(t, rec, "upload-doc")
	var doc fileDTO
	if err := json.Unmarshal(env.Data, &doc); err != nil {
		t.Fatalf("upload-doc: unmarshal: %v", err)
	}
	if doc.FolderID != folderID {
		t.Errorf("folderId attendu %s, got %s", folderID, doc.FolderID)
	}

	// Same name, same folder → NAME_CONFLICT
	rec = uploadMultipart(t, r, tokenA, folderID, "doc.txt", []byte("doc"))
	expectError(t, rec, http.StatusConflict, "NAME_CONFLICT", "upload-dupe")

	// Création de fichiers du user B
	if err := repo.Resources.InsertFile(userB, repository.NewID(), "secret.txt", "", 4, nil, nil); err != nil {
		t.Fatalf("insert B file: %v", err)
	}

	// Liste racine (A)
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files", tokenA, nil, "")
	env = expectOK(t, rec, "list")
	var files []fileDTO
	if err := json.Unmarshal(env.Data, &files); err != nil {
		t.Fatalf("list: unmarshal: %v", err)
	}
	if len(files) != 1 || files[0].ID != uploaded.ID {
		t.Errorf("liste racine A: %+v", files)
	}
	if env.Meta == nil || env.Meta.Total != 1 {
		t.Errorf("meta attendu total=1, got %+v", env.Meta)
	}

	// Liste dans le dossier (A)
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files?folderId="+folderID, tokenA, nil, "")
	env = expectOK(t, rec, "list-folder")
	files = nil
	if err := json.Unmarshal(env.Data, &files); err != nil {
		t.Fatalf("list-folder: unmarshal: %v", err)
	}
	if len(files) != 1 || files[0].ID != doc.ID {
		t.Errorf("liste dossier: %+v", files)
	}

	// B (autre user) ne voit pas les fichiers de A
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+uploaded.ID, tokenB, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-cross-device")

	// Get + delete côté A
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+uploaded.ID, tokenA, nil, "")
	env = expectOK(t, rec, "get")
	var got fileDTO
	if err := json.Unmarshal(env.Data, &got); err != nil {
		t.Fatalf("get: unmarshal: %v", err)
	}
	if got.ID != uploaded.ID || got.MimeType != "application/octet-stream" || got.CreatedAt == "" {
		t.Errorf("get FileDto inattendu: %+v", got)
	}

	rec, _ = doRequest(t, r, http.MethodDelete, "/api/v1/files/"+uploaded.ID, tokenA, nil, "")
	env = expectOK(t, rec, "delete")
	var deleted struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(env.Data, &deleted); err != nil {
		t.Fatalf("delete: unmarshal: %v", err)
	}
	if deleted.ID != uploaded.ID {
		t.Errorf("delete id: %+v", deleted)
	}

	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+uploaded.ID, tokenA, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-after-delete")
}

func TestSearchFiles(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "s"), "search-test-password", device)

	if err := repo.Resources.InsertFile(user, repository.NewID(), "vacances-août.jpg", "", 100, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := repo.Resources.InsertFile(user, repository.NewID(), "rapport-q3.pdf", "", 100, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := repo.Resources.InsertFile(user, repository.NewID(), "toto.txt", "", 100, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}

	// q obligatoire
	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/files/search", token, nil, "")
	expectError(t, rec, http.StatusBadRequest, "INVALID_REQUEST", "search-no-q")

	// insensible à la casse + sous-chaîne
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/search?q=RAPPORT", token, nil, "")
	env := expectOK(t, rec, "search")
	var files []fileDTO
	if err := json.Unmarshal(env.Data, &files); err != nil {
		t.Fatalf("search: unmarshal: %v", err)
	}
	if len(files) != 1 || files[0].Name != "rapport-q3.pdf" {
		t.Errorf("search 'RAPPORT': %+v", files)
	}
	if env.Meta == nil || env.Meta.Total != 1 {
		t.Errorf("meta search: %+v", env.Meta)
	}

	// wildcards neutralisés (trouve que "toto", pas tous les fichiers)
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/search?q=%25", token, nil, "")
	env = expectOK(t, rec, "search-escaped")
	files = nil
	if err := json.Unmarshal(env.Data, &files); err != nil {
		t.Fatalf("search-escaped: unmarshal: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("q=%% doit ne rien matcher, got %+v", files)
	}
}

func TestSearchFilesEscapesPercent(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "sp"), "search-test-password", device)

	if err := repo.Resources.InsertFile(user, repository.NewID(), "half%price.txt", "", 1, nil, nil); err != nil {
		t.Fatalf("insert percent file: %v", err)
	}
	if err := repo.Resources.InsertFile(user, repository.NewID(), "plain.txt", "", 1, nil, nil); err != nil {
		t.Fatalf("insert plain file: %v", err)
	}

	// q=% (encodé %25) ne doit matcher QUE le nom contenant un '%' littéral.
	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/files/search?q=%25", token, nil, "")
	env := expectOK(t, rec, "search-percent")
	var files []fileDTO
	if err := json.Unmarshal(env.Data, &files); err != nil {
		t.Fatalf("search-percent: unmarshal: %v", err)
	}
	if len(files) != 1 || files[0].Name != "half%price.txt" {
		t.Errorf("'%%' littéral : attendu 1 résultat, got %+v", files)
	}
}

func TestUploadTooLarge(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "l"), "upload-test-password", device)

	rec := uploadMultipart(t, r, token, "", "big.txt", []byte("0123456789ABCDEF"))
	expectError(t, rec, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "upload-big")
}

func TestUploadIntoUnknownFolder(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "uf"), "upload-test-password", device)

	rec := uploadMultipart(t, r, token, repository.NewID(), "orphan.txt", []byte("hi"))
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "upload-unknown-folder")
}

func TestUploadNameConflict(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "uc"), "upload-test-password", device)

	rec := uploadMultipart(t, r, token, "", "dupe.txt", []byte("hi"))
	if rec.Code != http.StatusOK {
		t.Fatalf("premier upload: status %d body=%s", rec.Code, rec.Body.String())
	}

	// Même nom à la racine → conflit d'unicité (parent_id NULL)
	rec = uploadMultipart(t, r, token, "", "dupe.txt", []byte("hi"))
	expectError(t, rec, http.StatusConflict, "NAME_CONFLICT", "upload-dupe")
}

func TestFoldersListAndScoping(t *testing.T) {
	r, _, repo := setup(t)
	deviceA := repository.NewID()
	deviceB := repository.NewID()
	tokenA, userA := registerAndLogin(t, r, repo, testUserUsername(deviceA, "fa"), "folder-test-password", deviceA)
	_, userB := registerAndLogin(t, r, repo, testUserUsername(deviceB, "fb"), "folder-test-password-b", deviceB)

	if err := repo.Resources.InsertFolder(userA, repository.NewID(), "AA", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}
	if err := repo.Resources.InsertFolder(userA, repository.NewID(), "BB", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}
	if err := repo.Resources.InsertFolder(userB, repository.NewID(), "CC", ""); err != nil {
		t.Fatalf("insert folder B: %v", err)
	}

	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/files/folders", tokenA, nil, "")
	env := expectOK(t, rec, "folders")
	var folders []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(env.Data, &folders); err != nil {
		t.Fatalf("folders: unmarshal: %v", err)
	}
	if len(folders) != 2 || folders[0].Name != "AA" || folders[1].Name != "BB" {
		t.Errorf("folders A: %+v", folders)
	}
}

func TestFilesPaginationDefaultsAndClamp(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, _ := registerAndLogin(t, r, repo, testUserUsername(device, "pg"), "pagination-test-password", device)

	// pageSize au-delà de 200 → clampé à 200
	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/files?pageSize=9999", token, nil, "")
	env := expectOK(t, rec, "pageSize-clamp")
	if env.Meta == nil || env.Meta.Page != 1 || env.Meta.PageSize != 200 {
		t.Errorf("clamp pageSize: %+v", env.Meta)
	}

	// Paramètres invalides → défauts (page=1, pageSize=50)
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files?page=0&pageSize=-5", token, nil, "")
	env = expectOK(t, rec, "invalid-params")
	if env.Meta == nil || env.Meta.Page != 1 || env.Meta.PageSize != 50 {
		t.Errorf("defauts page/pageSize: %+v", env.Meta)
	}

	// sort/order inconnus → pas d'erreur (défaut created_at desc)
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files?sort=zzz&order=up&pageSize=10", token, nil, "")
	expectOK(t, rec, "invalid-sort")
}

func TestFilesListSortBySize(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "sr"), "sort-test-password", device)

	// Tri volontairement désordonné : 30, 10, 20.
	if err := repo.Resources.InsertFile(user, repository.NewID(), "a.txt", "", 30, nil, nil); err != nil {
		t.Fatalf("insert a: %v", err)
	}
	if err := repo.Resources.InsertFile(user, repository.NewID(), "b.txt", "", 10, nil, nil); err != nil {
		t.Fatalf("insert b: %v", err)
	}
	if err := repo.Resources.InsertFile(user, repository.NewID(), "c.txt", "", 20, nil, nil); err != nil {
		t.Fatalf("insert c: %v", err)
	}

	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/files?sort=size&order=asc", token, nil, "")
	env := expectOK(t, rec, "sort-size")
	var files []fileDTO
	if err := json.Unmarshal(env.Data, &files); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(files) != 3 || files[0].Size != 10 || files[1].Size != 20 || files[2].Size != 30 {
		t.Errorf("ordre size asc inattendu: %+v", files)
	}
}

func TestFilesGetDeleteRejectInvalidID(t *testing.T) {
	r, _, repo := setup(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "ii"), "invalid-id-test-password", device)

	// ID non 32-hex → 404 avant toute requête.
	rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/files/NOT-HEX-ID", token, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-invalid-id")

	rec, _ = doRequest(t, r, http.MethodDelete, "/api/v1/files/xyz", token, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "delete-invalid-id")

	// ID 32-hex mais inconnu (du même user) → 404.
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+repository.NewID(), token, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-unknown")

	// Le user ne voit jamais les fichiers d'un autre même avec un ID valide.
	fileID := repository.NewID()
	if err := repo.Resources.InsertFile(user, fileID, "mine.txt", "", 4, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}
	otherDevice := repository.NewID()
	otherToken, _ := registerAndLogin(t, r, repo, testUserUsername(otherDevice, "ii2"), "invalid-id-test-password-b", otherDevice)
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+fileID, otherToken, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-cross-user")
}
