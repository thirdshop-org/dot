package service

import (
	"fmt"
	"os"
	"strings"

	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/ocr"
)

type OCRService struct {
	client *ocr.Client
}

func NewOCRService(cfg *config.Config) *OCRService {
	return &OCRService{
		client: ocr.NewClient(cfg.OCREndpoint),
	}
}

func (s *OCRService) RecognizeFromFile(filePath string) ([]ocr.TextBlock, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	return s.client.Recognize(data)
}

func (s *OCRService) RecognizeFromBytes(data []byte) ([]ocr.TextBlock, error) {
	return s.client.Recognize(data)
}

func (s *OCRService) FlattenResults(blocks []ocr.TextBlock) string {
	var texts []string
	for _, b := range blocks {
		texts = append(texts, b.Text)
	}
	return strings.Join(texts, "\n")
}

func (s *OCRService) HealthCheck() error {
	return s.client.HealthCheck()
}
