package service

import (
	"log"
	"os"
	"strings"

	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/ocr"
)

type OCRJob struct {
	FileID   string
	FilePath string
}

type OCRService struct {
	client  *ocr.Client
	fileSvc *FileService
	jobs    chan OCRJob
}

func NewOCRService(cfg *config.Config, fileSvc *FileService) *OCRService {
	return &OCRService{
		client:  ocr.NewClient(cfg.OCREndpoint),
		fileSvc: fileSvc,
		jobs:    make(chan OCRJob, 100),
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

func (s *OCRService) Enqueue(fileID, filePath string) {
	s.jobs <- OCRJob{FileID: fileID, FilePath: filePath}
	log.Printf("[OCR] Enqueued file %s", fileID)
}

func (s *OCRService) worker() {
	for job := range s.jobs {
		s.process(job)
	}
}

func (s *OCRService) process(job OCRJob) {
	log.Printf("[OCR] Processing file %s", job.FileID)

	data, err := os.ReadFile(job.FilePath)
	if err != nil {
		log.Printf("[OCR] Failed to read file %s: %v", job.FileID, err)
		return
	}

	blocks, err := s.client.Recognize(data)
	if err != nil {
		log.Printf("[OCR] Failed to recognize file %s: %v", job.FileID, err)
		return
	}

	text := s.FlattenResults(blocks)

	if err := s.fileSvc.UpdateOCRText(job.FileID, text); err != nil {
		log.Printf("[OCR] Failed to update ocr_text for file %s: %v", job.FileID, err)
		return
	}

	log.Printf("[OCR] Completed file %s (%d chars)", job.FileID, len(text))
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
