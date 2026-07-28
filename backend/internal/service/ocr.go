package service

import (
	"log"
	"os"
	"strings"

	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/ocr"
)

type OCRJob struct {
	ResourceID string
	FilePath   string
}

type OCRService struct {
	client      *ocr.Client
	resourceSvc *ResourceService
	jobs        chan OCRJob
}

func NewOCRService(cfg *config.Config, resourceSvc *ResourceService) *OCRService {
	return &OCRService{
		client:      ocr.NewClient(cfg.OCREndpoint),
		resourceSvc: resourceSvc,
		jobs:        make(chan OCRJob, 100),
	}
}

func (s *OCRService) Start() {
	go s.worker()
	log.Println("[OCR] Worker started")
}

func (s *OCRService) Stop() {
	close(s.jobs)
	log.Println("[OCR] Worker stopped")
}

func (s *OCRService) Enqueue(resourceID, filePath string) {
	s.jobs <- OCRJob{ResourceID: resourceID, FilePath: filePath}
	log.Printf("[OCR] Enqueued resource %s", resourceID)
}

func (s *OCRService) worker() {
	for job := range s.jobs {
		s.process(job)
	}
}

func (s *OCRService) process(job OCRJob) {
	log.Printf("[OCR] Processing resource %s", job.ResourceID)

	data, err := os.ReadFile(job.FilePath)
	if err != nil {
		log.Printf("[OCR] Failed to read resource %s: %v", job.ResourceID, err)
		return
	}

	blocks, err := s.client.Recognize(data)
	if err != nil {
		log.Printf("[OCR] Failed to recognize resource %s: %v", job.ResourceID, err)
		return
	}

	text := s.FlattenResults(blocks)

	if err := s.resourceSvc.UpdateOCRText(job.ResourceID, text); err != nil {
		log.Printf("[OCR] Failed to update ocr_text for resource %s: %v", job.ResourceID, err)
		return
	}

	log.Printf("[OCR] Completed resource %s (%d chars)", job.ResourceID, len(text))
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

func (s *OCRService) QueueLength() int {
	return len(s.jobs)
}
