package service

import (
	"encoding/json"
	"log"
	"os"

	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/nlp"
)

type NLPJob struct {
	FileID   string
	FilePath string
	OCRText  string
}

type NLPService struct {
	client  *nlp.Client
	fileSvc *FileService
	jobs    chan NLPJob
}

func NewNLPService(cfg *config.Config, fileSvc *FileService) *NLPService {
	return &NLPService{
		client:  nlp.NewClient(cfg.NLPEndpoint),
		fileSvc: fileSvc,
		jobs:    make(chan NLPJob, 100),
	}
}

func (s *NLPService) Start() {
	go s.worker()
	log.Println("[NLP] Worker started")
}

func (s *NLPService) Stop() {
	close(s.jobs)
	log.Println("[NLP] Worker stopped")
}

func (s *NLPService) Enqueue(fileID, filePath, ocrText string) {
	s.jobs <- NLPJob{FileID: fileID, FilePath: filePath, OCRText: ocrText}
	log.Printf("[NLP] Enqueued file %s", fileID)
}

func (s *NLPService) worker() {
	for job := range s.jobs {
		s.process(job)
	}
}

func (s *NLPService) process(job NLPJob) {
	log.Printf("[NLP] Processing file %s", job.FileID)

	text := job.OCRText

	if text == "" {
		data, err := os.ReadFile(job.FilePath)
		if err != nil {
			log.Printf("[NLP] Failed to read file %s: %v", job.FileID, err)
			return
		}
		text = string(data)
	}

	if text == "" {
		log.Printf("[NLP] No text to analyze for file %s, skipping", job.FileID)
		return
	}

	result, err := s.client.Analyze(text)
	if err != nil {
		log.Printf("[NLP] Failed to analyze file %s: %v", job.FileID, err)
		return
	}

	nlpData, err := json.Marshal(result)
	if err != nil {
		log.Printf("[NLP] Failed to marshal NLP result for file %s: %v", job.FileID, err)
		return
	}

	if err := s.fileSvc.UpdateNLPData(job.FileID, string(nlpData)); err != nil {
		log.Printf("[NLP] Failed to update nlp_data for file %s: %v", job.FileID, err)
		return
	}

	log.Printf("[NLP] Completed file %s (%d entities, %d sentences)", job.FileID, len(result.Entities), len(result.Sentences))
}

func (s *NLPService) AnalyzeText(text string) (*nlp.AnalyzedFile, error) {
	return s.client.Analyze(text)
}

func (s *NLPService) HealthCheck() error {
	return s.client.HealthCheck()
}

func (s *NLPService) QueueLength() int {
	return len(s.jobs)
}
