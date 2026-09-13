package repository

import (
	"errors"
	"testing"

	"github.com/vaultdrop/backend/dbtest"
)

func newTestRepo(t *testing.T) *Repository {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, repositoryTestURL)
	return NewRepository(conn)
}

func seedOcrJobFixture(t *testing.T) (*Repository, string, string, string) {
	t.Helper()
	repo := newTestRepo(t)
	userID, err := repo.Users.Create("ocr-user", "ocr-user", "hash", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	deviceID := NewID()
	if err := repo.Devices.Upsert(deviceID); err != nil {
		t.Fatalf("register device: %v", err)
	}
	fileID := NewID()
	if err := repo.Resources.InsertFile(userID, fileID, "scan.png", "", 10, nil, nil); err != nil {
		t.Fatalf("insert file: %v", err)
	}
	return repo, userID, deviceID, fileID
}

func TestOcrJobsLifecycleTransitions(t *testing.T) {
	repo, _, deviceID, fileID := seedOcrJobFixture(t)
	jobID := NewID()

	if err := repo.OcrJobs.Create(jobID, deviceID, fileID); err != nil {
		t.Fatalf("create: %v", err)
	}
	row, err := repo.OcrJobs.Get(deviceID, jobID)
	if err != nil || row.Status != "queued" {
		t.Fatalf("get (queued): %+v err=%v", row, err)
	}

	if err := repo.OcrJobs.TouchProcessing(deviceID, jobID); err != nil {
		t.Fatalf("touch processing: %v", err)
	}
	row, _ = repo.OcrJobs.Get(deviceID, jobID)
	if row.Status != "processing" {
		t.Errorf("status attendu processing, got %q", row.Status)
	}

	if err := repo.OcrJobs.Complete(deviceID, jobID, "HELLO"); err != nil {
		t.Fatalf("complete: %v", err)
	}
	row, _ = repo.OcrJobs.Get(deviceID, jobID)
	if row.Status != "done" || row.Text == nil || *row.Text != "HELLO" {
		t.Errorf("after complete: %+v", row)
	}
}

func TestOcrJobsFail(t *testing.T) {
	repo, _, deviceID, fileID := seedOcrJobFixture(t)
	jobID := NewID()
	if err := repo.OcrJobs.Create(jobID, deviceID, fileID); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := repo.OcrJobs.Fail(deviceID, jobID, "tesseract exploded"); err != nil {
		t.Fatalf("fail: %v", err)
	}
	row, err := repo.OcrJobs.Get(deviceID, jobID)
	if err != nil || row.Status != "failed" || row.Error == nil || *row.Error != "tesseract exploded" {
		t.Errorf("après fail : %+v err=%v", row, err)
	}
}

func TestOcrJobsGetScopedByDevice(t *testing.T) {
	repo, _, deviceID, fileID := seedOcrJobFixture(t)
	jobID := NewID()
	if err := repo.OcrJobs.Create(jobID, deviceID, fileID); err != nil {
		t.Fatalf("create: %v", err)
	}

	otherDevice := NewID()
	if err := repo.Devices.Upsert(otherDevice); err != nil {
		t.Fatalf("register other device: %v", err)
	}
	if _, err := repo.OcrJobs.Get(otherDevice, jobID); !errors.Is(err, ErrJobNotFound) {
		t.Errorf("get par un autre device : attendu ErrJobNotFound, got %v", err)
	}
}
