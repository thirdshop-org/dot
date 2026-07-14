package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"aidanwoods.dev/go-paseto"
	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/db"
	"golang.org/x/crypto/argon2"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUsernameTaken      = errors.New("username already taken")
	ErrInvalidToken       = errors.New("invalid or expired token")
)

const (
	accessTokenTTL  = 30 * time.Minute
	refreshTokenTTL = 7 * 24 * time.Hour
	saltLength       = 16
)

type AuthService struct {
	queries *db.Queries
	key     paseto.V4SymmetricKey
	parser  *paseto.Parser
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type UserResponse struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

func NewAuthService(queries *db.Queries, cfg *config.Config) (*AuthService, error) {
	key, err := paseto.V4SymmetricKeyFromHex(cfg.PASETOKey)
	if err != nil {
		return nil, fmt.Errorf("invalid paseto key: %w", err)
	}

	parser := paseto.NewParser()
	parser.AddRule(paseto.NotExpired())

	return &AuthService{
		queries: queries,
		key:     key,
		parser:  &parser,
	}, nil
}

func (s *AuthService) Register(ctx context.Context, username, password string) (*TokenPair, *UserResponse, error) {
	username = strings.TrimSpace(username)
	if len(username) < 3 || len(username) > 30 {
		return nil, nil, fmt.Errorf("username must be 3-30 characters")
	}
	if len(password) < 8 {
		return nil, nil, fmt.Errorf("password must be at least 8 characters")
	}

	existing, err := s.queries.GetUserByUsername(ctx, username)
	if err == nil && existing.ID != "" {
		return nil, nil, ErrUsernameTaken
	}

	hash, err := hashPassword(password)
	if err != nil {
		return nil, nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.queries.CreateUser(ctx, db.CreateUserParams{
		Username:     username,
		PasswordHash: hash,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("create user: %w", err)
	}

	tokens, err := s.generateTokens(ctx, user.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("generate tokens: %w", err)
	}

	return tokens, &UserResponse{ID: user.ID, Username: user.Username}, nil
}

func (s *AuthService) Login(ctx context.Context, username, password string) (*TokenPair, *UserResponse, error) {
	user, err := s.queries.GetUserByUsername(ctx, strings.TrimSpace(username))
	if err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	if !verifyPassword(password, user.PasswordHash) {
		return nil, nil, ErrInvalidCredentials
	}

	tokens, err := s.generateTokens(ctx, user.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("generate tokens: %w", err)
	}

	return tokens, &UserResponse{ID: user.ID, Username: user.Username}, nil
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	userID, err := s.validateRefreshToken(refreshToken)
	if err != nil {
		return nil, ErrInvalidToken
	}

	tokenHash := hashToken(refreshToken)
	stored, err := s.queries.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, ErrInvalidToken
	}

	if stored.UserID != userID {
		return nil, ErrInvalidToken
	}

	if err := s.queries.RevokeRefreshToken(ctx, tokenHash); err != nil {
		return nil, fmt.Errorf("revoke refresh token: %w", err)
	}

	tokens, err := s.generateTokens(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("generate tokens: %w", err)
	}

	return tokens, nil
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	tokenHash := hashToken(refreshToken)
	return s.queries.RevokeRefreshToken(ctx, tokenHash)
}

func (s *AuthService) ValidateAccessToken(token string) (string, error) {
	parsed, err := s.parser.ParseV4Local(s.key, token, nil)
	if err != nil {
		return "", ErrInvalidToken
	}

	userID, err := parsed.GetString("user_id")
	if err != nil || userID == "" {
		return "", ErrInvalidToken
	}

	return userID, nil
}

func (s *AuthService) generateTokens(ctx context.Context, userID string) (*TokenPair, error) {
	accessToken, err := s.createAccessToken(userID)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.createRefreshToken(userID)
	if err != nil {
		return nil, err
	}

	refreshHash := hashToken(refreshToken)
	_, err = s.queries.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: refreshHash,
		ExpiresAt: time.Now().Add(refreshTokenTTL),
	})
	if err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

func (s *AuthService) createAccessToken(userID string) (string, error) {
	token := paseto.NewToken()
	token.Set("user_id", userID)
	token.SetExpiration(time.Now().Add(accessTokenTTL))
	return token.V4Encrypt(s.key, nil), nil
}

func (s *AuthService) createRefreshToken(userID string) (string, error) {
	token := paseto.NewToken()
	token.Set("user_id", userID)
	token.SetExpiration(time.Now().Add(refreshTokenTTL))
	return token.V4Encrypt(s.key, nil), nil
}

func (s *AuthService) validateRefreshToken(token string) (string, error) {
	parsed, err := s.parser.ParseV4Local(s.key, token, nil)
	if err != nil {
		return "", ErrInvalidToken
	}

	userID, err := parsed.GetString("user_id")
	if err != nil || userID == "" {
		return "", ErrInvalidToken
	}

	return userID, nil
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=1,p=4$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

func verifyPassword(password, encodedHash string) bool {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return sha256.Sum256(hash) == sha256.Sum256(expectedHash)
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
