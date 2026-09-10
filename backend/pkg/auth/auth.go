package auth

import (
	"crypto/sha256"
	"errors"
	"time"

	"aidanwoods.dev/go-paseto"
)

// TokenTTL = 7 jours, sans refresh (V1). À expiration, le client doit
// re-demander un POST /auth/login.
const TokenTTL = 7 * 24 * time.Hour

var ErrInvalidToken = errors.New("invalid token")

// Identity est le résultat de Verify : l'utilisateur (sujet du token, autorisant)
// et le device (claim secondaire, porté mais NON autorisant seul).
type Identity struct {
	UserID   string
	DeviceID string
}

// Manager issues and verifies paseto v4-local bearer tokens.
// Le subject est l'USER (scope des ressources) ; device_id est un claim
// transporté pour l'idempotence outbox et le nommage des uploads.
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

// Issue émet un token lié à un utilisateur ET à un device.
func (m *Manager) Issue(userID, deviceID string) (string, error) {
	now := time.Now()
	token := paseto.NewToken()
	token.SetIssuedAt(now)
	token.SetNotBefore(now)
	token.SetExpiration(now.Add(TokenTTL))
	token.SetSubject(userID)
	// v1.6.0 : SetString n'expose pas d'erreur (panic si non sérialisable).
	token.SetString("device_id", deviceID)
	return token.V4Encrypt(m.key, nil), nil
}

// Verify décode et contrôle le token, retourne l'identité (user + device).
func (m *Manager) Verify(signed string) (Identity, error) {
	parsed, err := paseto.NewParserForValidNow().ParseV4Local(m.key, signed, nil)
	if err != nil {
		return Identity{}, ErrInvalidToken
	}
	userID, err := parsed.GetSubject()
	if err != nil || userID == "" {
		return Identity{}, ErrInvalidToken
	}
	deviceID, err := parsed.GetString("device_id")
	if err != nil || deviceID == "" {
		return Identity{}, ErrInvalidToken
	}
	return Identity{UserID: userID, DeviceID: deviceID}, nil
}
