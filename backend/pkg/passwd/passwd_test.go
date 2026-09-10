package passwd

import (
	"strings"
	"testing"
)

func TestHashVerifyRoundTrip(t *testing.T) {
	hash, err := Hash("mon-super-mot-de-passe")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=65536,t=1,p=4$") {
		t.Errorf("format inattendu : %s", hash)
	}
	if err := Verify("mon-super-mot-de-passe", hash); err != nil {
		t.Errorf("Verify (bon mot de passe) = %v", err)
	}
	if err := Verify("mauvais", hash); err != ErrMismatch {
		t.Errorf("Verify (mauvais mot de passe) = %v, attendu ErrMismatch", err)
	}
}

func TestVerifyTimedEqualUnknownUsername(t *testing.T) {
	// username inconnu → stored vide → vérification contre dummyHash.
	// Ne doit JAMAIS réussir, et doit retourner ErrMismatch proprement.
	if err := VerifyTimedEqual("whatever", ""); err != ErrMismatch {
		t.Errorf("VerifyTimedEqual(stored vide) = %v, attendu ErrMismatch", err)
	}
}

func TestVerifyMalformed(t *testing.T) {
	cases := []string{
		"",
		"pas-un-hash",
		"$argon2id$v=19$m=65536,t=1,p=4$AAAA",
		"$argon2id$v=18$m=65536,t=1,p=4$c2FsdA==$a2V5",
	}
	for _, stored := range cases {
		if err := Verify("x", stored); err != ErrMalformed {
			t.Errorf("Verify(%q) = %v, attendu ErrMalformed", stored, err)
		}
	}
}

func TestHashIsSaltRandomized(t *testing.T) {
	a, _ := Hash("same")
	b, _ := Hash("same")
	if a == b {
		t.Error("deux hashes du même mot de passe identiques (salt non randomisé ?)")
	}
}

func TestHashNeverExposesPassword(t *testing.T) {
	hash, err := Hash("secret-password")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if strings.Contains(hash, "secret-password") {
		t.Error("le hash contient le mot de passe en clair")
	}
}
