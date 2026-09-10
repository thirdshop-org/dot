package service

import (
	"errors"
	"fmt"
	"strings"

	"github.com/vaultdrop/backend/pkg/passwd"
	"github.com/vaultdrop/backend/repository"
)

// ErrAdminRequired : base vide et identifiants admin absents → le serveur
// refuse de démarrer : sans compte administrateur, il serait inutilisable
// tout en paraissant sain.
var ErrAdminRequired = errors.New("ADMIN_USERNAME/ADMIN_PASSWORD requis au premier démarrage (users vide)")

// NormalizeUsername normalise un username : trim + lowercase. C'est la forme
// recherchée (username_normalized) et l'unique clé de résolution.
func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// EnsureAdmin crée le compte admin au premier démarrage si la table users est
// vide. Idempotent : l'env n'écrase jamais un compte existant.
func EnsureAdmin(repo *repository.Repository, username, password string) error {
	count, err := repo.Users.Count()
	if err != nil {
		return fmt.Errorf("bootstrap admin: count: %w", err)
	}
	if count > 0 {
		return nil
	}
	if strings.TrimSpace(username) == "" || password == "" {
		return ErrAdminRequired
	}

	hash, err := passwd.Hash(password)
	if err != nil {
		return fmt.Errorf("bootstrap admin: hash: %w", err)
	}
	normalized := NormalizeUsername(username)
	if _, err := repo.Users.Create(normalized, normalized, hash, true); err != nil {
		return fmt.Errorf("bootstrap admin: create: %w", err)
	}
	// Jamais de log du mot de passe ni du hash.
	return nil
}
