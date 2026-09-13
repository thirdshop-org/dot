package service

import (
	"errors"
	"testing"

	"github.com/vaultdrop/backend/pkg/passwd"
	"github.com/vaultdrop/backend/repository"
)

func TestEnsureAdminCreatesFirstAdmin(t *testing.T) {
	s := newServiceStore(t)
	repo := s.Repository

	if err := EnsureAdmin(repo, " Admin ", "admin-secret-123"); err != nil {
		t.Fatalf("EnsureAdmin: %v", err)
	}

	user, err := repo.Users.GetByUsernameNormalized("admin")
	if err != nil {
		t.Fatalf("admin non trouvé: %v", err)
	}
	if !user.IsAdmin {
		t.Error("le compte créé doit être admin")
	}
	if user.UsernameNormalized != "admin" || user.Username != "admin" {
		t.Errorf("identité anormale: %+v", user)
	}
	if err := passwd.Verify("admin-secret-123", user.PasswordHash); err != nil {
		t.Errorf("le mot de passe doit vérifier: %v", err)
	}
}

func TestNormalizeUsername(t *testing.T) {
	cases := map[string]string{
		" admin ": "admin",
		" Alice":  "alice",
		"A B C":   "a b c",
		"":        "",
		"  ":      "",
	}
	for in, want := range cases {
		if got := NormalizeUsername(in); got != want {
			t.Errorf("NormalizeUsername(%q) = %q, attendu %q", in, got, want)
		}
	}
}

func TestEnsureAdminRefusesOnEmptyDBWithoutEnv(t *testing.T) {
	s := newServiceStore(t)

	err := EnsureAdmin(s.Repository, "", "")
	if !errors.Is(err, ErrAdminRequired) {
		t.Errorf("env absent : attendu ErrAdminRequired, got %v", err)
	}

	err = EnsureAdmin(s.Repository, "   ", "some-password")
	if !errors.Is(err, ErrAdminRequired) {
		t.Errorf("username blanc : attendu ErrAdminRequired, got %v", err)
	}
}

func TestEnsureAdminNeverOverwritesExistingAccounts(t *testing.T) {
	s := newServiceStore(t)
	repo := s.Repository

	// La base n'est PAS vide → l'env ne doit rien créer, même avec des valeurs.
	if _, err := repo.Users.Create("alice", "alice", "existing-hash", false); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	if err := EnsureAdmin(repo, "ADMIN", "would-be-admin-secret"); err != nil {
		t.Fatalf("EnsureAdmin sur base non vide : %v", err)
	}

	// Aucun admin n'a été ajouté, l'existant est intact.
	if _, err := repo.Users.GetByUsernameNormalized("admin"); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("admin ne doit pas exister sur base non vide (err=%v)", err)
	}
	alice, err := repo.Users.GetByUsernameNormalized("alice")
	if err != nil {
		t.Fatalf("alice doit être intacte: %v", err)
	}
	if alice.PasswordHash != "existing-hash" || alice.IsAdmin {
		t.Errorf("l'existant doit être préservé: %+v", alice)
	}
}
