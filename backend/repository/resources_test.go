package repository

import (
	"errors"
	"testing"
	"time"

	"github.com/vaultdrop/backend/dbtest"
)

const repositoryTestURL = "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop_repository_test?sslmode=disable"

func newTestResources(t *testing.T) *Resources {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, repositoryTestURL)
	return &Resources{DB: conn}
}

func mustInsertUser(t *testing.T, repo *Resources, userID string) {
	t.Helper()
	users := &Users{DB: repo.DB}
	username := "user-" + userID[:8]
	if _, err := users.DB.Exec(
		`INSERT INTO users (id, username, username_normalized, password_hash, is_admin, created_at)
		 VALUES ($1, $2, $3, 'test-hash', false, NOW())`,
		userID, username, username,
	); err != nil {
		t.Fatalf("create user: %v", err)
	}
}

func TestCRUDScopedByOwner(t *testing.T) {
	repo := newTestResources(t)
	owner := NewID()
	other := NewID()
	mustInsertUser(t, repo, owner)
	mustInsertUser(t, repo, other)

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
		t.Errorf("autre user doit voir NOT_FOUND, got %v", err)
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
	mustInsertUser(t, repo, owner)

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

func TestSearchFilesEscapesWildcards(t *testing.T) {
	repo := newTestResources(t)
	owner := NewID()
	mustInsertUser(t, repo, owner)

	insert := func(name string) {
		t.Helper()
		if err := repo.InsertFile(owner, NewID(), name, "", 1, nil, nil); err != nil {
			t.Fatalf("insert %q: %v", name, err)
		}
	}
	insert("half%price.txt")
	insert("plain.txt")
	insert("a_b.txt")
	insert("abx.txt")
	insert(`win\file.txt`)

	// '%' littéral → uniquement le nom contenant un '%'
	files, total, err := repo.SearchFiles(owner, "%", 50, 0)
	if err != nil {
		t.Fatalf("search %%: %v", err)
	}
	if total != 1 || len(files) != 1 || files[0].Name != "half%price.txt" {
		t.Errorf("'%%' littéral : total=%d files=%+v", total, files)
	}

	// '_' littéral → uniquement a_b.txt (pas abx.txt)
	files, total, err = repo.SearchFiles(owner, "_", 50, 0)
	if err != nil {
		t.Fatalf("search _: %v", err)
	}
	if total != 1 || files[0].Name != "a_b.txt" {
		t.Errorf("'_' littéral : total=%d files=%+v", total, files)
	}

	// '\' littéral → uniquement win\file.txt
	files, total, err = repo.SearchFiles(owner, `win\file`, 50, 0)
	if err != nil {
		t.Fatalf("search backslash: %v", err)
	}
	if total != 1 || files[0].Name != `win\file.txt` {
		t.Errorf("'\\' littéral : total=%d files=%+v", total, files)
	}
}

func TestListFilesPagination(t *testing.T) {
	repo := newTestResources(t)
	owner := NewID()
	mustInsertUser(t, repo, owner)

	for _, name := range []string{"a.txt", "b.txt", "c.txt"} {
		if err := repo.InsertFile(owner, NewID(), name, "", 1, nil, nil); err != nil {
			t.Fatalf("insert %q: %v", name, err)
		}
	}

	files, total, err := repo.ListFiles(owner, "", 2, 0, "name", "asc")
	if err != nil {
		t.Fatalf("list page 1: %v", err)
	}
	if total != 3 || len(files) != 2 || files[0].Name != "a.txt" || files[1].Name != "b.txt" {
		t.Errorf("page 1 : total=%d files=%+v", total, files)
	}

	files, total, err = repo.ListFiles(owner, "", 2, 2, "name", "asc")
	if err != nil {
		t.Fatalf("list page 2: %v", err)
	}
	if total != 3 || len(files) != 1 || files[0].Name != "c.txt" {
		t.Errorf("page 2 : total=%d files=%+v", total, files)
	}
}

func TestListOwnedDelta(t *testing.T) {
	repo := newTestResources(t)
	owner := NewID()
	mustInsertUser(t, repo, owner)

	if err := repo.InsertFolder(owner, NewID(), "Docs", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}
	if err := repo.InsertFile(owner, NewID(), "old.txt", "", 1, nil, nil); err != nil {
		t.Fatalf("insert old: %v", err)
	}

	// aprèsMs=0 → tout
	all, err := repo.ListOwned(owner, 0)
	if err != nil || len(all) != 2 {
		t.Fatalf("snapshot complet: %+v err=%v", all, err)
	}

	// aprèsMs dans le futur → vide
	far, err := repo.ListOwned(owner, time.Now().Add(time.Hour).UnixMilli())
	if err != nil || len(far) != 0 {
		t.Errorf("aprèsMs futur : attendu vide, got %+v err=%v", far, err)
	}

	// Delta : une ressource insérée APRÈS baseline → uniquement celle-là.
	baseline := time.Now()
	time.Sleep(5 * time.Millisecond)
	freshID := NewID()
	if err := repo.InsertFile(owner, freshID, "fresh.txt", "", 1, nil, nil); err != nil {
		t.Fatalf("insert fresh: %v", err)
	}

	delta, err := repo.ListOwned(owner, baseline.UnixMilli())
	if err != nil {
		t.Fatalf("delta: %v", err)
	}
	if len(delta) != 1 || delta[0].ID != freshID {
		t.Errorf("delta attendu uniquement fresh.txt, got %+v", delta)
	}
}
