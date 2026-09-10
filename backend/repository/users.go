package repository

import (
	"database/sql"
	"time"
)

// UserRow est une ligne users (identité locale, pas le DTO du contrat).
type UserRow struct {
	ID                 string
	Username           string
	UsernameNormalized string
	PasswordHash       string
	IsAdmin            bool
	CreatedAt          time.Time
}

// Users persiste les comptes utilisateurs (auth par login, cf. tranche identité).
type Users struct {
	DB *sql.DB
}

// Count retourne le nombre d'utilisateurs (y compris supprimés) — sert au
// bootstrap admin au démarrage.
func (u *Users) Count() (int, error) {
	var n int
	err := u.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// GetByUsernameNormalized cherche le compte actif par username normalisé
// (lowercase, unique). Absent → ErrNotFound.
func (u *Users) GetByUsernameNormalized(normalized string) (*UserRow, error) {
	row := u.DB.QueryRow(
		`SELECT id, username, username_normalized, password_hash, is_admin, created_at
		 FROM users
		 WHERE username_normalized = $1 AND deleted_at IS NULL`,
		normalized,
	)
	user, err := scanUser(row.Scan)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return user, err
}

// GetByID charge un compte actif par id. Absent → ErrNotFound.
func (u *Users) GetByID(id string) (*UserRow, error) {
	row := u.DB.QueryRow(
		`SELECT id, username, username_normalized, password_hash, is_admin, created_at
		 FROM users
		 WHERE id = $1 AND deleted_at IS NULL`,
		id,
	)
	user, err := scanUser(row.Scan)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return user, err
}

// ResolveExact est l'unique résolution de destinataire (aucun listing, aucun
// préfixe) : {id, username} pour le username normalisé, ou ErrNotFound.
func (u *Users) ResolveExact(normalized string) (*UserRow, error) {
	return u.GetByUsernameNormalized(normalized)
}

// Create insère un compte avec un id 32-hex généré. Retourne l'id.
func (u *Users) Create(username, usernameNormalized, passwordHash string, isAdmin bool) (string, error) {
	id := NewID()
	_, err := u.DB.Exec(
		`INSERT INTO users (id, username, username_normalized, password_hash, is_admin, created_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())`,
		id, username, usernameNormalized, passwordHash, isAdmin,
	)
	if isUniqueViolation(err) {
		return "", ErrNameConflict
	}
	if err != nil {
		return "", err
	}
	return id, nil
}

// UpdatePassword remplace le hash du compte. Les tokens déjà émis restent
// valides 7 jours : limite assumée V1 (pas de liste de révocation).
func (u *Users) UpdatePassword(id, newHash string) error {
	_, err := u.DB.Exec(
		`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
		id, newHash,
	)
	return err
}

// MarkDeleted soft-delete un compte : les tokens issus sont rejetés par le
// middleware (GetByID filtre deleted_at).
func (u *Users) MarkDeleted(id string) error {
	_, err := u.DB.Exec(
		`UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
		id,
	)
	return err
}

func scanUser(scan func(...any) error) (*UserRow, error) {
	var user UserRow
	err := scan(&user.ID, &user.Username, &user.UsernameNormalized, &user.PasswordHash, &user.IsAdmin, &user.CreatedAt)
	return &user, err
}
