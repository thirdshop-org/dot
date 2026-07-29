package service

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/db"
	"github.com/vaultdrop/backend/internal/ocr"
)

type OCRJob struct {
	DBID       uuid.UUID
	ResourceID string
	FilePath   string
}

type OCRService struct {
	client      *ocr.Client
	resourceSvc *ResourceService
	broker      *EventBroker
	queries     *db.Queries
	jobs        chan OCRJob
}

func NewOCRService(database *sql.DB, queries *db.Queries, cfg *config.Config, resourceSvc *ResourceService, broker *EventBroker) *OCRService {
	return &OCRService{
		client:      ocr.NewClient(cfg.OCREndpoint),
		resourceSvc: resourceSvc,
		broker:      broker,
		queries:     queries,
		jobs:        make(chan OCRJob, 100),
	}
}

func (s *OCRService) Start(workerCount int) {
	s.replenish()
	for i := range workerCount {
		go s.worker()
		log.Printf("[OCR] Worker %d started", i)
	}
}

func (s *OCRService) Stop() {
	close(s.jobs)
	log.Println("[OCR] Worker stopped")
}

func (s *OCRService) Enqueue(resourceID, filePath string) error {
	ctx := context.Background()

	resourceUUID, err := uuid.Parse(resourceID)
	if err != nil {
		return fmt.Errorf("parse resource id: %w", err)
	}

	dbJob, err := s.queries.CreateOCRJob(ctx, db.CreateOCRJobParams{
		ResourceID: resourceUUID,
		FilePath:   filePath,
	})
	if err != nil {
		return fmt.Errorf("create ocr job: %w", err)
	}

	job := OCRJob{DBID: dbJob.ID, ResourceID: resourceID, FilePath: filePath}

	select {
	case s.jobs <- job:
		log.Printf("[OCR] Enqueued resource %s (job %s)", resourceID, dbJob.ID)
		return nil
	default:
		log.Printf("[OCR] Queue full, resource %s persisted as pending (job %s)", resourceID, dbJob.ID)
		return nil
	}
}

func (s *OCRService) replenish() {
	ctx := context.Background()
	pending, err := s.queries.ListPendingOCRJobs(ctx)
	if err != nil {
		log.Printf("[OCR] Failed to load pending jobs: %v", err)
		return
	}
	for _, j := range pending {
		job := OCRJob{DBID: j.ID, ResourceID: j.ResourceID.String(), FilePath: j.FilePath}
		select {
		case s.jobs <- job:
			log.Printf("[OCR] Replenished job %s (resource %s)", j.ID, j.ResourceID)
		default:
			log.Printf("[OCR] Queue full, leaving job %s in pending", j.ID)
			return
		}
	}
}

func (s *OCRService) worker() {
	for job := range s.jobs {
		s.process(job)
	}
}

func (s *OCRService) process(job OCRJob) {
	ctx := context.Background()
	log.Printf("[OCR] Processing resource %s", job.ResourceID)

	s.queries.UpdateOCRJobStatus(ctx, db.UpdateOCRJobStatusParams{
		ID:     job.DBID,
		Status: "processing",
	})

	data, err := os.ReadFile(job.FilePath)
	if err != nil {
		log.Printf("[OCR] Failed to read resource %s: %v", job.ResourceID, err)
		s.queries.UpdateOCRJobStatus(ctx, db.UpdateOCRJobStatusParams{
			ID:           job.DBID,
			Status:       "failed",
			ErrorMessage: err.Error(),
		})
		return
	}

	blocks, err := s.client.Recognize(data)
	if err != nil {
		log.Printf("[OCR] Failed to recognize resource %s: %v", job.ResourceID, err)
		s.queries.UpdateOCRJobStatus(ctx, db.UpdateOCRJobStatusParams{
			ID:           job.DBID,
			Status:       "failed",
			ErrorMessage: err.Error(),
		})
		return
	}

	text := s.FlattenResults(blocks)

	if err := s.resourceSvc.UpdateOCRText(job.ResourceID, text); err != nil {
		log.Printf("[OCR] Failed to update ocr_text for resource %s: %v", job.ResourceID, err)
		s.queries.UpdateOCRJobStatus(ctx, db.UpdateOCRJobStatusParams{
			ID:           job.DBID,
			Status:       "failed",
			ErrorMessage: err.Error(),
		})
		return
	}

	s.queries.UpdateOCRJobStatus(ctx, db.UpdateOCRJobStatusParams{
		ID:     job.DBID,
		Status: "done",
	})
	s.broker.Publish("ocr_done", job.ResourceID)
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
