package service

import (
	"crypto/sha256"
)

func CreateSHA256Hash(data []byte) []byte {
	h := sha256.Sum256(data)
	return h[:]
}
