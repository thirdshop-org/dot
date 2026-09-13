package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/vaultdrop/backend/ocr"
	"github.com/vaultdrop/backend/repository"
)

// stubEngine again (package service) — même contrat que handlers/ocr_test.
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

// newTestOcr builds an Ocr over a fresh DB and returns it with the ids.
func newTestOcr(t *testing.T, uploadDir string, engine ocr.Engine) (*Ocr, string, string, string) {
	t.Helper()
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "ocr-failed")
	deviceID := mustRegisterDevice(t, s.Repository, repository.NewID())
	return NewOcr(s.Repository, uploadDir, "fra+eng", engine), userID, deviceID, uploadDir
}

// waitTillTerminal poll jusqu'à un statut terminal (done/failed).
func waitTillTerminal(t *testing.T, o *Ocr, deviceID, jobID string) repository.OcrJobRow {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		row, err := o.Repository.OcrJobs.Get(deviceID, jobID)
		if err != nil {
			t.Fatalf("get job: %v", err)
		}
		if row.Status == "done" || row.Status == "failed" {
			return row
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("job jamais terminal")
	return repository.OcrJobRow{}
}

func insertOcrFile(t *testing.T, o *Ocr, userID, fileID string) {
	t.Helper()
	if err := o.Repository.Resources.InsertFile(userID, fileID, "scan.png", "", 128, nil, nil); err != nil {
		t.Fatalf("insert file: %v", err)
	}
}

func TestOcrPhysicalPath(t *testing.T) {
	uploadDir := t.TempDir()
	userID := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	fileID := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

	if err := os.MkdirAll(filepath.Join(uploadDir, userID), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// Vérifie que l'extension du fichier trouvé est acceptée (glob = ordre
	// alphabétique, on ne présume pas du nom choisi).
	if err := os.WriteFile(filepath.Join(uploadDir, userID, fileID+".png"), []byte("x"), 0o644); err != nil {
		t.Fatalf("write png: %v", err)
	}

	o := NewOcr(nil, uploadDir, "fra+eng", nil)

	found, err := o.physicalPath(userID, fileID)
	if err != nil {
		t.Fatalf("physicalPath: %v", err)
	}
	if !strings.HasPrefix(filepath.Base(found), fileID+".") {
		t.Errorf("path = %q, attendu préfixe %q", found, fileID+".")
	}

	if _, err := o.physicalPath(userID, "cccccccccccccccccccccccccccccccc"); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("fichier absent : attendu ErrNotFound, got %v", err)
	}
}

func TestOcrJobFailsWhenPhysicalFileMissing(t *testing.T) {
	o, userID, deviceID, _ := newTestOcr(t, t.TempDir(), stubEngine{text: "x"})

	fileID := repository.NewID()
	insertOcrFile(t, o, userID, fileID)

	job, err := o.Create(userID, deviceID, fileID)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	row := waitTillTerminal(t, o, deviceID, job.ID)
	if row.Status != "failed" || row.Error == nil {
		t.Errorf("fichier physique absent : attendu failed avec erreur, got %+v", row)
	}
}

func TestOcrJobFailsOnEngineError(t *testing.T) {
	uploadDir := t.TempDir()
	o, userID, deviceID, _ := newTestOcr(t, uploadDir, stubEngine{err: errors.New("tesseract boom")})

	fileID := repository.NewID()
	insertOcrFile(t, o, userID, fileID)
	// Le fichier physique doit exister pour atteindre l'engine.
	if err := os.MkdirAll(filepath.Join(uploadDir, userID), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, userID, fileID+".png"), []byte("img"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	job, err := o.Create(userID, deviceID, fileID)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	row := waitTillTerminal(t, o, deviceID, job.ID)
	if row.Status != "failed" || row.Error == nil || !strings.Contains(*row.Error, "tesseract boom") {
		t.Errorf("erreur engine : attendu failed avec message engine, got %+v", row)
	}
}
