package repository

import (
	"errors"
	"testing"

	"github.com/vaultdrop/backend/dbtest"
)

func newTestUsers(t *testing.T) *Users {
	t.Helper()
	conn := dbtest.OpenTestDatabase(t, repositoryTestURL)
	return &Users{DB: conn}
}

func TestUsersCreateGetAndCount(t *testing.T) {
	u := newTestUsers(t)

	id, err := u.Create("Alice", "alice", "hash-1", false)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	row, err := u.GetByUsernameNormalized("alice")
	if err != nil {
		t.Fatalf("get by normalized: %v", err)
	}
	if row.ID != id || row.Username != "Alice" || row.UsernameNormalized != "alice" || row.IsAdmin || row.PasswordHash != "hash-1" {
		t.Errorf("row inattendue: %+v", row)
	}

	byID, err := u.GetByID(id)
	if err != nil || byID.ID != id {
		t.Fatalf("get by id: %+v err=%v", byID, err)
	}

	resolved, err := u.ResolveExact("alice")
	if err != nil || resolved.ID != id {
		t.Fatalf("resolve exact: %+v err=%v", resolved, err)
	}

	n, err := u.Count()
	if err != nil || n != 1 {
		t.Errorf("count = %d err=%v, attendu 1", n, err)
	}

	// Doublon de username normalisé → ErrNameConflict.
	if _, err := u.Create("alice2", "alice", "hash-X", false); !errors.Is(err, ErrNameConflict) {
		t.Errorf("doublon normalisé : attendu ErrNameConflict, got %v", err)
	}
}

func TestUsersUpdatePassword(t *testing.T) {
	u := newTestUsers(t)
	id, err := u.Create("bob", "bob", "hash-1", false)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := u.UpdatePassword(id, "hash-2"); err != nil {
		t.Fatalf("update password: %v", err)
	}
	row, err := u.GetByID(id)
	if err != nil || row.PasswordHash != "hash-2" {
		t.Errorf("hash après update = %q (err=%v)", row.PasswordHash, err)
	}
}

func TestUsersMarkDeletedHidesAccount(t *testing.T) {
	u := newTestUsers(t)
	id, err := u.Create("carol", "carol", "hash-1", false)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := u.MarkDeleted(id); err != nil {
		t.Fatalf("mark deleted: %v", err)
	}
	if _, err := u.GetByID(id); !errors.Is(err, ErrNotFound) {
		t.Errorf("get by id après suppression : attendu ErrNotFound, got %v", err)
	}
	if _, err := u.GetByUsernameNormalized("carol"); !errors.Is(err, ErrNotFound) {
		t.Errorf("get par username après suppression : attendu ErrNotFound, got %v", err)
	}
	if n, _ := u.Count(); n != 1 {
		t.Errorf("count doit compter aussi les supprimés (bootstrap), got %d", n)
	}
}
