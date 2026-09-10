package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/vaultdrop/backend/pkg/api"
	"github.com/vaultdrop/backend/pkg/auth"
	"github.com/vaultdrop/backend/pkg/passwd"
	"github.com/vaultdrop/backend/repository"
	"github.com/vaultdrop/backend/service"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	DeviceID string `json:"device_id"`
}

type LoginUserDTO struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
}

type LoginResponse struct {
	Token     string       `json:"token"`
	ExpiresAt int64        `json:"expires_at"`
	User      LoginUserDTO `json:"user"`
}

// AuthLogin est la SEULE porte d'émission de token (V1). L'erreur est
// volontairement indistinguable entre « username inconnu » et « mauvais mot de
// passe » — même code, même message, délai égalisé via passwd.VerifyTimedEqual.
func AuthLogin(c *gin.Context) {
	if Store == nil || Store.Repository == nil || Auth == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}

	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.Username) == "" || req.Password == "" || req.DeviceID == "" {
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "username, password and device_id are required")
		return
	}

	normalized := service.NormalizeUsername(req.Username)
	user, userErr := Store.Repository.Users.GetByUsernameNormalized(normalized)

	// Même durée de traitement que le compte existe ou non (username inconnu =>
	// stored vide → vérification contre dummyHash).
	stored := ""
	if userErr == nil && user != nil {
		stored = user.PasswordHash
	}
	if err := passwd.VerifyTimedEqual(req.Password, stored); err != nil {
		if errors.Is(err, passwd.ErrMismatch) {
			api.Error(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid credentials")
			return
		}
		api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not verify credentials")
		return
	}

	exists, err := Store.Repository.Devices.Exists(req.DeviceID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not check device")
		return
	}
	if !exists {
		api.Error(c, http.StatusBadRequest, "INVALID_DEVICE_ID", "device not registered")
		return
	}

	if err := Store.Repository.Devices.MarkUser(req.DeviceID, user.ID); err != nil {
		api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not update device")
		return
	}

	token, err := Auth.Issue(user.ID, req.DeviceID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "TOKEN_ERROR", "could not issue token")
		return
	}

	api.OK(c, LoginResponse{
		Token:     token,
		ExpiresAt: time.Now().Add(auth.TokenTTL).UnixMilli(),
		User: LoginUserDTO{
			ID:       user.ID,
			Username: user.Username,
			IsAdmin:  user.IsAdmin,
		},
	})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword met à jour le hash du compte connecté. Le mot de passe
// courant est requis. Limite connue V1 : les tokens déjà émis restent valides
// jusqu'à expiration (7 j, pas de révocation) — cf. docs/api-v1.md §7.
func ChangePassword(c *gin.Context) {
	if Store == nil || Store.Repository == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	userID := c.GetString(UserIDKey)

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
		return
	}
	if len(req.NewPassword) < 8 {
		api.Error(c, http.StatusBadRequest, "INVALID_PASSWORD", "new password must be at least 8 characters")
		return
	}

	user, err := Store.Repository.Users.GetByID(userID)
	if err != nil {
		api.Error(c, http.StatusUnauthorized, "UNAUTHORIZED", "account not found")
		return
	}
	if err := passwd.Verify(req.CurrentPassword, user.PasswordHash); err != nil {
		api.Error(c, http.StatusForbidden, "INVALID_PASSWORD", "current password is incorrect")
		return
	}

	newHash, err := passwd.Hash(req.NewPassword)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not hash new password")
		return
	}
	if err := Store.Repository.Users.UpdatePassword(userID, newHash); err != nil {
		api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not update password")
		return
	}

	api.OK(c, gin.H{"id": userID})
}

// ResolveUser résout UN destinataire par username EXACT (normalisé lowercase).
// Jamais de listing ni de préfixe (pas d'énumération de comptes). Ne renvoie
// que {id, username} — jamais email/is_admin/created_at.
func ResolveUser(c *gin.Context) {
	if Store == nil || Store.Repository == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	username := service.NormalizeUsername(c.Query("username"))
	if username == "" {
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "username is required")
		return
	}

	user, err := Store.Repository.Users.ResolveExact(username)
	if errors.Is(err, repository.ErrNotFound) {
		api.Error(c, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "INTERNAL", "could not resolve user")
		return
	}

	api.OK(c, gin.H{"id": user.ID, "username": user.Username})
}
