package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

type URLService struct {
	secret         string
	serverHost     string
	expiryDuration time.Duration
}

func NewURLService(secret, serverHost string, expiryMinutes int) *URLService {
	if expiryMinutes <= 0 {
		expiryMinutes = 60
	}
	return &URLService{
		secret:         secret,
		serverHost:     serverHost,
		expiryDuration: time.Duration(expiryMinutes) * time.Minute,
	}
}

func (s *URLService) sign(id string, expires int64) string {
	data := fmt.Sprintf("%s:%d", id, expires)
	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *URLService) GenerateDownloadURL(resourceUUID string) string {
	expires := time.Now().Add(s.expiryDuration).Unix()
	sig := s.sign(resourceUUID, expires)

	return fmt.Sprintf(
		"%s/api/v1/resources/download/%s?expires=%d&sig=%s",
		s.serverHost,
		resourceUUID,
		expires,
		sig,
	)
}

func (s *URLService) GenerateVariantURL(variantUUID string) string {
	expires := time.Now().Add(s.expiryDuration).Unix()
	sig := s.sign(variantUUID, expires)

	return fmt.Sprintf(
		"%s/api/v1/variants/%s?expires=%d&sig=%s",
		s.serverHost,
		variantUUID,
		expires,
		sig,
	)
}

func (s *URLService) Validate(id, sig string, expires int64) bool {
	if time.Now().Unix() > expires {
		return false
	}
	expected := s.sign(id, expires)
	return hmac.Equal([]byte(sig), []byte(expected))
}
