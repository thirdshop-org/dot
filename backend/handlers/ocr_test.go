package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/dbtest"
	"github.com/vaultdrop/backend/handlers"
	"github.com/vaultdrop/backend/pkg/auth"
	"github.com/vaultdrop/backend/repository"
	"github.com/vaultdrop/backend/service"
)

type stubEngine struct {
	text string
	err  error
}

func (s stubEngine) ExtractText(_ context.Context, _ string, _ string) (string, error) {
	if s.err != nil {
		return "", s.err
	}
	return s.text, nil
}

func setupOcr(t *testing.T) (*gin.Engine, string, *repository.Repository) {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, handlersTestURL)
	repo := repository.NewRepository(conn)
	uploadDir := t.TempDir()
	store := service.NewResources(repo, uploadDir, 100*1024)

	manager, _ := auth.NewManager("test-secret")
	handlers.Auth = manager
	handlers.Store = store
	handlers.Ocr = service.NewOcr(repo, uploadDir, "fra+eng", stubEngine{text: "HELLO OCR"})

	gin.SetMode(gin.TestMode)
	r := gin.New()
	handlers.RegisterRoutes(r)
	return r, uploadDir, repo
}

type ocrJobDTO struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Text   string `json:"text"`
	Error  string `json:"error"`
}

func waitTerminal(t *testing.T, r *gin.Engine, token, jobID string) ocrJobDTO {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		rec, _ := doRequest(t, r, http.MethodGet, "/api/v1/ocr/jobs/"+jobID, token, nil, "")
		env := expectOK(t, rec, "ocr-get")
		var job ocrJobDTO
		if err := json.Unmarshal(env.Data, &job); err != nil {
			t.Fatalf("ocr-get: unmarshal: %v", err)
		}
		if job.Status == "done" || job.Status == "failed" {
			return job
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("job OCR jamais terminal")
	return ocrJobDTO{}
}

func TestOcrJobsLifecycle(t *testing.T) {
	r, uploadDir, repo := setupOcr(t)
	device := repository.NewID()
	token, user := registerAndLogin(t, r, repo, testUserUsername(device, "oa"), "ocr-test-password", device)

	// Fichier + fichier physique (simule UPLOAD_DIR/<user>/<id>.txt — après
	// 000007 le répertoire d'upload est scopé par USER)
	fileID := repository.NewID()
	if err := os.MkdirAll(filepath.Join(uploadDir, user), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, user, fileID+".txt"), []byte("ignored by stub"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := repo.Resources.InsertFile(user, fileID, "scan.png", "", 128, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}

	// Création du job
	body, _ := json.Marshal(map[string]string{"fileId": fileID})
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/ocr/jobs", token, body, "application/json")
	env := expectOK(t, rec, "ocr-create")
	var created ocrJobDTO
	if err := json.Unmarshal(env.Data, &created); err != nil {
		t.Fatalf("ocr-create: unmarshal: %v", err)
	}
	if created.Status != "queued" || created.ID == "" {
		t.Errorf("job attendu queued: %+v", created)
	}

	// Poll jusqu'au terminal
	job := waitTerminal(t, r, token, created.ID)
	if job.Status != "done" || job.Text != "HELLO OCR" {
		t.Errorf("job terminal: %+v", job)
	}

	// Fichier inconnu → NOT_FOUND
	rec, _ = doRequest(t, r, http.MethodPost, "/api/v1/ocr/jobs", token, bodyFor(repository.NewID()), "application/json")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "ocr-missing-file")
}

func TestOcrJobsScopedByOwner(t *testing.T) {
	r, _, repo := setupOcr(t)
	deviceA := repository.NewID()
	deviceB := repository.NewID()
	tokenA, userA := registerAndLogin(t, r, repo, testUserUsername(deviceA, "oc"), "ocr-test-password", deviceA)
	tokenB, _ := registerAndLogin(t, r, repo, testUserUsername(deviceB, "od"), "ocr-test-password-b", deviceB)

	fileID := repository.NewID()
	if err := repo.Resources.InsertFile(userA, fileID, "scan.png", "", 128, nil, nil); err != nil {
		t.Fatalf("insert: %v", err)
	}
	body, _ := json.Marshal(map[string]string{"fileId": fileID})
	rec, _ := doRequest(t, r, http.MethodPost, "/api/v1/ocr/jobs", tokenA, body, "application/json")
	env := expectOK(t, rec, "ocr-create")
	var created ocrJobDTO
	_ = json.Unmarshal(env.Data, &created)

	// Un autre user ne voit pas le job
	rec, _ = doRequest(t, r, http.MethodGet, "/api/v1/ocr/jobs/"+created.ID, tokenB, nil, "")
	expectError(t, rec, http.StatusNotFound, "NOT_FOUND", "ocr-other-owner")
}

func bodyFor(id string) []byte {
	b, _ := json.Marshal(map[string]string{"fileId": id})
	return b
}
