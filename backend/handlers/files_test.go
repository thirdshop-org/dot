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
	Code    string `json:"code"`
	Message string `json:"message"`
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
	var e apiError
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		t.Fatalf("%s: unmarshal error: %v body=%s", path, err, rec.Body.String())
	}
	if e.Code != code {
		t.Errorf("%s: code erreur attendu %s, got %s", path, code, e.Code)
	}
}

func registerDevice(t *testing.T, r *gin.Engine, deviceID string) string {
	t.Helper()
	body := fmt.Sprintf(`{"deviceId":%q}`, deviceID)
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/devices", "", []byte(body), "application/json")
	var env struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("register: unmarshal: %v body=%s", err, rec.Body.String())
	}
	if env.Data.Token == "" {
		t.Fatalf("register: pas de token (status %d)", rec.Code)
	}
	return env.Data.Token
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
	tokenA := registerDevice(t, r, deviceA)
	tokenB := registerDevice(t, r, deviceB)

	folderID := repository.NewID()
	if err := repo.Resources.InsertFolder(deviceA, folderID, "Docs", ""); err != nil {
		t.Fatalf("insert root folder: %v", err)
	}

	// Upload root + dossier
	rec := uploadMultipart(t, r, tokenA, "", "hello.txt", []byte("hello world"))
	env := expectOK(t, rec, "upload")
	var uploaded fileDTO
	if err := json.Unmarshal(env.Data, &uploaded); err != nil {
		t.Fatalf("upload: unmarshal: %v", err)
	}
	if uploaded.Name != "hello.txt" || uploaded.Size != 11 || uploaded.FolderID != "" || uploaded.ID == "" {
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

	// Création de fichiers du device B
	if err := repo.Resources.InsertFile(deviceB, repository.NewID(), "secret.txt", "", 4, nil, nil); err != nil {
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

	// B ne voit pas les fichiers de A
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+uploaded.ID, tokenB, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "get-cross-device")

	// Get + delete côté A
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/files/"+uploaded.ID, tokenA, nil, "")
	env = expectOK(t, rec, "get")
	var got fileDTO
	if err := json.Unmarshal(env.Data, &got); err != nil {
		t.Fatalf("get: unmarshal: %v", err)
	}
	if got.ID != uploaded.ID || got.MimeType != "text/plain" || got.CreatedAt == "" {
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

func TestUploadTooLarge(t *testing.T) {
	r, _, _ := setup(t)
	device := repository.NewID()
	token := registerDevice(t, r, device)

	rec := uploadMultipart(t, r, token, "", "big.txt", []byte("0123456789ABCDEF"))
	expectError(t, rec, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "upload-big")
}

func TestFoldersListAndScoping(t *testing.T) {
	r, _, repo := setup(t)
	deviceA := repository.NewID()
	deviceB := repository.NewID()
	tokenA := registerDevice(t, r, deviceA)
	registerDevice(t, r, deviceB)

	if err := repo.Resources.InsertFolder(deviceA, repository.NewID(), "AA", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}
	if err := repo.Resources.InsertFolder(deviceA, repository.NewID(), "BB", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}
	if err := repo.Resources.InsertFolder(deviceB, repository.NewID(), "CC", ""); err != nil {
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
