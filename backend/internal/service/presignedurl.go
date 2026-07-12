package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

const secret = "thisismyrandomstring"

func sign(fileID string, expires int64, secret string) string {
	data := fmt.Sprintf("%s:%d", fileID, expires)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func GenerateFileDownloadUrl(fileID string) string {
	expires := time.Now().Add(10 * time.Minute).Unix()
	sig := sign(fileID, expires, secret)

	url := fmt.Sprintf(
		"http://192.168.1.17:8080/api/v1/files/%s?expires=%d&sig=%s",
		fileID,
		expires,
		sig,
	)

	return url
}

func Validate(fileID, sig string, expires int64) bool {
	if time.Now().Unix() > expires {
		return false
	}

	expected := sign(fileID, expires, secret)
	return hmac.Equal([]byte(sig), []byte(expected))
}
