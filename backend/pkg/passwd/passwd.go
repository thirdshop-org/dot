// Package passwd gère le hachage des mots de passe (argon2id).
// Paramètres explicites, jamais de défauts implicites de la lib.
// Attention : ne jamais logger ni exposer un hash hors de Verify/Hash.
package passwd

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Paramètres argon2id (OWASP-ish, raisonnables pour un usage familial V1).
const (
	argonTime    = 1
	argonMemory  = 64 * 1024 // 64 MiB
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16
)

var (
	// ErrMismatch : mot de passe (ou dummy) ne correspond pas au hash.
	ErrMismatch = errors.New("invalid password")
	// ErrMalformed : hash stocké illisible/corrompu dans la base.
	ErrMalformed = errors.New("malformed password hash")
)

// dummyHash est un hash argon2id valide d'un mot de passe aléatoire fixe.
// Il sert d'égalisation de timing : quand le username est inconnu, on vérifie
// quand même contre ce hash pour que le délai de réponse soit identique à un
// « mauvais mot de passe ».
var dummyHash = func() string {
	h, err := Hash("vaultdrop-constantime-dummy")
	if err != nil {
		panic(fmt.Sprintf("passwd: impossible de pré-hacher le dummy: %v", err))
	}
	return h
}()

// Hash produit une chaîne encodable : $argon2id$v=19$m=65536,t=1,p=4$<salt>$<hash>.
func Hash(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("passwd: rand: %w", err)
	}

	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)

	params := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d",
		argon2.Version, argonMemory, argonTime, argonThreads)
	saltEnc := base64.RawStdEncoding.EncodeToString(salt)
	keyEnc := base64.RawStdEncoding.EncodeToString(key)
	return params + "$" + saltEnc + "$" + keyEnc, nil
}

// Verify compare le mot de passe au hash stocké (temps constant sur le hash).
// En cas de hash corrompu, on vérifie contre le dummyHash (même délai).
func Verify(password, stored string) error {
	fields := strings.Split(stored, "$")
	if len(fields) != 6 || fields[1] != "argon2id" {
		return ErrMalformed
	}

	var version int
	if _, err := fmt.Sscanf(fields[2], "v=%d", &version); err != nil || version != argon2.Version {
		return ErrMalformed
	}

	var memory, timeCost, threads int
	if _, err := fmt.Sscanf(fields[3], "m=%d,t=%d,p=%d", &memory, &timeCost, &threads); err != nil {
		return ErrMalformed
	}

	salt, err := base64.RawStdEncoding.DecodeString(fields[4])
	if err != nil {
		return ErrMalformed
	}
	want, err := base64.RawStdEncoding.DecodeString(fields[5])
	if err != nil {
		return ErrMalformed
	}

	got := argon2.IDKey([]byte(password), salt, uint32(timeCost), uint32(memory), uint8(threads), uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return ErrMismatch
	}
	return nil
}

// VerifyTimedEqual vérifie le mot de passe fourni en égalisant le temps de
// réponse que le compte existe ou non : username inconnu → vérification contre
// dummyHash (retourne toujours ErrMismatch, dans un délai comparable).
func VerifyTimedEqual(password, stored string) error {
	target := stored
	if stored == "" {
		target = dummyHash
	}
	return Verify(password, target)
}
