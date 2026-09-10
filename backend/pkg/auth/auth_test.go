package auth

import (
	"strings"
	"testing"
)

func TestIssueVerifyRoundtrip(t *testing.T) {
	m, err := NewManager("test-secret")
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	deviceID := "0123456789abcdef0123456789abcdef"
	signed, err := m.Issue(deviceID)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	got, err := m.Verify(signed)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got != deviceID {
		t.Fatalf("Verify: got %q want %q", got, deviceID)
	}
}

func TestVerifyRejectsTamperedToken(t *testing.T) {
	m, err := NewManager("test-secret")
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	signed, _ := m.Issue("0123456789abcdef0123456789abcdef")
	parts := strings.Split(signed, ".")
	parts[len(parts)-1] = "nope"
	tampered := strings.Join(parts, ".")

	if _, err := m.Verify(tampered); err == nil {
		t.Fatal("expected tampered token to be rejected")
	}
}

func TestVerifyRejectsGarbage(t *testing.T) {
	m, err := NewManager("test-secret")
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	if _, err := m.Verify("not-a-token"); err == nil {
		t.Fatal("expected garbage to be rejected")
	}
}

func TestDifferentSecretRejectsToken(t *testing.T) {
	a, _ := NewManager("secret-a")
	b, _ := NewManager("secret-b")

	signed, _ := a.Issue("0123456789abcdef0123456789abcdef")
	if _, err := b.Verify(signed); err == nil {
		t.Fatal("expected token from another manager to be rejected")
	}
}
