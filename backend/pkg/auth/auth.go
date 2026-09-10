package auth

import (
	"crypto/sha256"
	"errors"
	"time"

	"aidanwoods.dev/go-paseto"
)

const TokenTTL = 90 * 24 * time.Hour

var ErrInvalidToken = errors.New("invalid token")

// Manager issues and verifies paseto v4-local bearer tokens bound to a device_id.
type Manager struct {
	key paseto.V4SymmetricKey
}

func NewManager(secret string) (*Manager, error) {
	sum := sha256.Sum256([]byte(secret))
	key, err := paseto.V4SymmetricKeyFromBytes(sum[:])
	if err != nil {
		return nil, err
	}
	return &Manager{key: key}, nil
}

func (m *Manager) Issue(deviceID string) (string, error) {
	now := time.Now()
	token := paseto.NewToken()
	token.SetIssuedAt(now)
	token.SetNotBefore(now)
	token.SetExpiration(now.Add(TokenTTL))
	token.SetSubject(deviceID)
	return token.V4Encrypt(m.key, nil), nil
}

func (m *Manager) Verify(signed string) (string, error) {
	parsed, err := paseto.NewParserForValidNow().ParseV4Local(m.key, signed, nil)
	if err != nil {
		return "", ErrInvalidToken
	}
	subject, err := parsed.GetSubject()
	if err != nil {
		return "", ErrInvalidToken
	}
	return subject, nil
}
