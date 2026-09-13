package auth

import (
	"strings"
	"testing"
	"time"

	"aidanwoods.dev/go-paseto"
)

const (
	testUserID   = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	testDeviceID = "0123456789abcdef0123456789abcdef"
)

func TestIssueVerifyRoundtrip(t *testing.T) {
	m, err := NewManager("test-secret")
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	signed, err := m.Issue(testUserID, testDeviceID)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	got, err := m.Verify(signed)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got.UserID != testUserID {
		t.Errorf("Verify.UserID = %q, want %q", got.UserID, testUserID)
	}
	if got.DeviceID != testDeviceID {
		t.Errorf("Verify.DeviceID = %q, want %q", got.DeviceID, testDeviceID)
	}
}

func TestIssueIsUserSubject(t *testing.T) {
	m, _ := NewManager("test-secret")
	signed, err := m.Issue(testUserID, testDeviceID)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	parsed, err := paseto.NewParserForValidNow().ParseV4Local(m.key, signed, nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if subject, _ := parsed.GetSubject(); subject != testUserID {
		t.Errorf("subject = %q, want user %q", subject, testUserID)
	}
}

func TestVerifyRejectsTamperedToken(t *testing.T) {
	m, _ := NewManager("test-secret")

	signed, _ := m.Issue(testUserID, testDeviceID)
	parts := strings.Split(signed, ".")
	parts[len(parts)-1] = "nope"
	tampered := strings.Join(parts, ".")

	if _, err := m.Verify(tampered); err == nil {
		t.Fatal("expected tampered token to be rejected")
	}
}

func TestVerifyRejectsGarbage(t *testing.T) {
	m, _ := NewManager("test-secret")
	if _, err := m.Verify("not-a-token"); err == nil {
		t.Fatal("expected garbage to be rejected")
	}
}

func TestDifferentSecretRejectsToken(t *testing.T) {
	a, _ := NewManager("secret-a")
	b, _ := NewManager("secret-b")

	signed, _ := a.Issue(testUserID, testDeviceID)
	if _, err := b.Verify(signed); err == nil {
		t.Fatal("expected token from another manager to be rejected")
	}
}

func TestVerifyRequiresDeviceClaim(t *testing.T) {
	m, _ := NewManager("test-secret")
	// Token sans claim device_id (subject seul, type de l'ancien format) → invalide.
	now := time.Now()
	token := paseto.NewToken()
	token.SetIssuedAt(now)
	token.SetNotBefore(now)
	token.SetExpiration(now.Add(TokenTTL))
	token.SetSubject(testUserID)
	signed := token.V4Encrypt(m.key, nil)
	if _, err := m.Verify(signed); err == nil {
		t.Fatal("expected token without device claim to be rejected")
	}
}

func TestIssueSetsExpiration(t *testing.T) {
	m, _ := NewManager("test-secret")
	before := time.Now()
	signed, err := m.Issue(testUserID, testDeviceID)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	parsed, err := paseto.NewParserForValidNow().ParseV4Local(m.key, signed, nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	exp, err := parsed.GetExpiration()
	if err != nil {
		t.Fatalf("GetExpiration: %v", err)
	}
	// Le TTL est fixé à 7 jours (docs/api-v1.md) — marge de 1 min par sécurité.
	lower := before.Add(TokenTTL - time.Minute)
	upper := before.Add(TokenTTL + time.Minute)
	if exp.Before(lower) || exp.After(upper) {
		t.Errorf("expiration = %v, attendu ≈ now+%v (fenêtre [%v, %v])", exp, TokenTTL, lower, upper)
	}
}
