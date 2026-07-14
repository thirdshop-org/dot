package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
)

type AuthHandler struct {
	auth *AuthService
}

func NewAuthHandler(auth *AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

type registerRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type logoutRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type authResponse struct {
	User         UserResponse `json:"user"`
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_INPUT", "username and password are required")
		return
	}

	tokens, user, err := h.auth.Register(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, ErrUsernameTaken):
			api.Error(c, http.StatusConflict, "USERNAME_TAKEN", "username already taken")
		default:
			api.Error(c, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		}
		return
	}

	c.JSON(http.StatusCreated, authResponse{
		User:         *user,
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_INPUT", "username and password are required")
		return
	}

	tokens, user, err := h.auth.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidCredentials):
			api.Error(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid username or password")
		default:
			api.Error(c, http.StatusInternalServerError, "INTERNAL_ERROR", "something went wrong")
		}
		return
	}

	c.JSON(http.StatusOK, authResponse{
		User:         *user,
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
	})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_INPUT", "refresh_token is required")
		return
	}

	tokens, err := h.auth.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidToken):
			api.Error(c, http.StatusUnauthorized, "INVALID_TOKEN", "invalid or expired refresh token")
		default:
			api.Error(c, http.StatusInternalServerError, "INTERNAL_ERROR", "something went wrong")
		}
		return
	}

	c.JSON(http.StatusOK, tokenResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var req logoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_INPUT", "refresh_token is required")
		return
	}

	if err := h.auth.Logout(c.Request.Context(), req.RefreshToken); err != nil {
		api.Error(c, http.StatusInternalServerError, "INTERNAL_ERROR", "something went wrong")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}
