package repository

import (
	"errors"
	"testing"

	"github.com/vaultdrop/backend/dbtest"
)

const repositoryTestURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_repository_test?sslmode=disable"

func newTestResources(t *testing.T) *Resources {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, repositoryTestURL)
	return &Resources{DB: conn}
}

func mustInsertDevice(t *testing.T, repo *Resources, deviceID string) {
	t.Helper()
	dev := &Devices{DB: repo.DB}
	if err := dev.Upsert(deviceID); err != nil {
		t.Fatalf("upsert device: %v", err)
	}
}

func TestCRUDScopedByOwner(t *testing.T) {
	repo := newTestResources(t)
	owner := NewID()
	other := NewID()
	mustInsertDevice(t, repo, owner)
	mustInsertDevice(t, repo, other)

	folderID := NewID()
	if err := repo.InsertFolder(owner, folderID, "Docs", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}

	mime := "text/plain"
	ext := "txt"
	fileID := NewID()
	if err := repo.InsertFile(owner, fileID, "note.txt", folderID, 42, &mime, &ext); err != nil {
		t.Fatalf("insert file: %v", err)
	}

	got, err := repo.GetFile(owner, fileID)
	if err != nil {
		t.Fatalf("get file: %v", err)
	}
	if got.Name != "note.txt" || got.FolderID != folderID || got.Size != 42 {
		t.Errorf("file row inattendu: %+v", got)
	}

	files, total, err := repo.ListFiles(owner, folderID, 10, 0, "created_at", "desc")
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	if total != 1 || len(files) != 1 || files[0].ID != fileID {
		t.Errorf("list folder: total=%d files=%+v", total, files)
	}

	roots, err := repo.ListRootFolders(owner)
	if err != nil {
		t.Fatalf("list roots: %v", err)
	}
	if len(roots) != 1 || roots[0].ID != folderID {
		t.Errorf("roots: %+v", roots)
	}

	if _, err := repo.GetFile(other, fileID); err != ErrNotFound {
		t.Errorf("autre device doit voir NOT_FOUND, got %v", err)
	}

	deleted, err := repo.DeleteFile(owner, fileID)
	if err != nil || deleted != fileID {
		t.Fatalf("delete file: %v %v", deleted, err)
	}
	if _, err := repo.GetFile(owner, fileID); err != ErrNotFound {
		t.Errorf("après suppression: %v", err)
	}
}

func TestNameConflictAndUnknownFolder(t *testing.T) {
	repo := newTestResources(t)
	owner := NewID()
	mustInsertDevice(t, repo, owner)

	folderID := NewID()
	if err := repo.InsertFolder(owner, folderID, "Docs", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}

	ext := "txt"
	if err := repo.InsertFile(owner, NewID(), "note.txt", folderID, 1, nil, &ext); err != nil {
		t.Fatalf("insert first file: %v", err)
	}
	if err := repo.InsertFile(owner, NewID(), "note.txt", folderID, 1, nil, nil); err != ErrNameConflict {
		t.Errorf("même nom dans le même dossier doit être NAME_CONFLICT, got %v", err)
	}

	// Le même nom est autorisé dans un dossier différent (UNIQUE(parent_id, name)).
	otherFolder := NewID()
	if err := repo.InsertFolder(owner, otherFolder, "Other", ""); err != nil {
		t.Fatalf("insert folder 2: %v", err)
	}
	if err := repo.InsertFile(owner, NewID(), "note.txt", otherFolder, 1, nil, nil); err != nil {
		t.Errorf("même nom dans un autre dossier : %v", err)
	}

	unknown := NewID()
	err := repo.InsertFile(owner, NewID(), "x.txt", unknown, 1, nil, nil)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("folder inconnu doit être NOT_FOUND, got %v", err)
	}
}
