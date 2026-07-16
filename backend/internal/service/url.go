package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

type URLService struct {
	secret     string
	serverHost string
}

func NewURLService(secret, serverHost string) *URLService {
	return &URLService{secret: secret, serverHost: serverHost}
}

func (s *URLService) sign(fileID string, expires int64) string {
	data := fmt.Sprintf("%s:%d", fileID, expires)
	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *URLService) GenerateDownloadURL(fileUUID string) string {
	expires := time.Now().Add(10 * time.Minute).Unix()
	sig := s.sign(fileUUID, expires)

	return fmt.Sprintf(
		"%s/api/v1/files/download/%s?expires=%d&sig=%s",
		s.serverHost,
		fileUUID,
		expires,
		sig,
	)
}

func (s *URLService) GenerateThumbnailURL(thumbUUID string) string {
	expires := time.Now().Add(10 * time.Minute).Unix()
	sig := s.sign(thumbUUID, expires)

	return fmt.Sprintf(
		"%s/api/v1/thumbnails/%s?expires=%d&sig=%s",
		s.serverHost,
		thumbUUID,
		expires,
		sig,
	)
}

func (s *URLService) Validate(fileID, sig string, expires int64) bool {
	if time.Now().Unix() > expires {
		return false
	}
	expected := s.sign(fileID, expires)
	return hmac.Equal([]byte(sig), []byte(expected))
}
