package service

import (
	"context"
	"fmt"
	"image"
	_ "image/jpeg"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/db"
)

type ConversionJob struct {
	FileID   string
	FilePath string
	MimeType string
}

type ConversionService struct {
	queries *db.Queries
	cfg     *config.Config
	jobs    chan ConversionJob
}

func NewConversionService(queries *db.Queries, cfg *config.Config) *ConversionService {
	return &ConversionService{
		queries: queries,
		cfg:     cfg,
		jobs:    make(chan ConversionJob, 100),
	}
}

func (s *ConversionService) Start() {
	go s.worker()
	log.Println("[Conversion] Worker started")
}

func (s *ConversionService) Stop() {
	close(s.jobs)
	log.Println("[Conversion] Worker stopped")
}

func (s *ConversionService) Enqueue(fileID, filePath, mimeType string) {
	s.jobs <- ConversionJob{FileID: fileID, FilePath: filePath, MimeType: mimeType}
	log.Printf("[Conversion] Enqueued file %s", fileID)
}

func (s *ConversionService) worker() {
	for job := range s.jobs {
		s.process(job)
	}
}

func (s *ConversionService) process(job ConversionJob) {
	log.Printf("[Conversion] Processing file %s (mime: %s)", job.FileID, job.MimeType)

	pdfPath := job.FilePath
	tmpDir := ""

	if isOfficeDocument(job.MimeType) {
		var err error
		pdfPath, tmpDir, err = s.convertToPDF(job.FilePath)
		if err != nil {
			log.Printf("[Conversion] Failed to convert file %s to PDF: %v", job.FileID, err)
			return
		}
		defer os.RemoveAll(tmpDir)
	} else if !isPDF(job.MimeType) {
		log.Printf("[Conversion] Skipping file %s: unsupported mime type %s", job.FileID, job.MimeType)
		return
	}

	thumbDir := filepath.Join(s.cfg.ThumbnailDir, job.FileID)
	if err := os.MkdirAll(thumbDir, 0o755); err != nil {
		log.Printf("[Conversion] Failed to create thumbnail dir for %s: %v", job.FileID, err)
		return
	}

	resolutions := []struct {
		label string
		dpi   int
	}{
		{"thumbnail", 21},
		{"full", 200},
	}

	for _, res := range resolutions {
		pages, err := s.convertPDFToImages(pdfPath, thumbDir, res.dpi)
		if err != nil {
			log.Printf("[Conversion] Failed to convert file %s to images (res=%s): %v", job.FileID, res.label, err)
			continue
		}

		for _, page := range pages {
			width, height, err := getImageDimensions(page.path)
			if err != nil {
				log.Printf("[Conversion] Failed to get dimensions for %s: %v", page.path, err)
				width, height = 0, 0
			}

			thumbUUID := uuid.New().String()
			dstPath := filepath.Join(thumbDir, thumbUUID+".jpg")
			if err := os.Rename(page.path, dstPath); err != nil {
				log.Printf("[Conversion] Failed to move %s to %s: %v", page.path, dstPath, err)
				continue
			}

			_, err = s.queries.CreateThumbnail(context.Background(), db.CreateThumbnailParams{
				FileID:          job.FileID,
				PageNumber:      int32(page.number),
				ResolutionLabel: res.label,
				Width:           int32(width),
				Height:          int32(height),
				StorageKey:      dstPath,
				MimeType:        "image/jpeg",
			})
			if err != nil {
				log.Printf("[Conversion] Failed to create thumbnail record for file %s page %d: %v", job.FileID, page.number, err)
				continue
			}
		}

		log.Printf("[Conversion] Generated %d %s images for file %s", len(pages), res.label, job.FileID)
	}

	log.Printf("[Conversion] Completed file %s", job.FileID)
}

func (s *ConversionService) convertToPDF(inputPath string) (string, string, error) {
	tmpDir, err := os.MkdirTemp("", "conversion-*")
	if err != nil {
		return "", "", fmt.Errorf("create temp dir: %w", err)
	}

	cmd := exec.Command(s.cfg.LibreOfficePath,
		"--headless",
		"--convert-to", "pdf",
		"--outdir", tmpDir,
		inputPath,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		os.RemoveAll(tmpDir)
		return "", "", fmt.Errorf("libreoffice conversion failed: %s: %w", string(output), err)
	}

	baseName := filepath.Base(inputPath)
	pdfName := strings.TrimSuffix(baseName, filepath.Ext(baseName)) + ".pdf"
	pdfPath := filepath.Join(tmpDir, pdfName)

	if _, err := os.Stat(pdfPath); os.IsNotExist(err) {
		os.RemoveAll(tmpDir)
		return "", "", fmt.Errorf("PDF not found at %s", pdfPath)
	}

	return pdfPath, tmpDir, nil
}

type imagePage struct {
	number int
	path   string
}

func (s *ConversionService) convertPDFToImages(pdfPath, outputDir string, dpi int) ([]imagePage, error) {
	prefix := filepath.Join(outputDir, fmt.Sprintf("tmp_%d_", dpi))

	cmd := exec.Command(s.cfg.PdftoppmPath,
		"-jpeg",
		"-r", fmt.Sprintf("%d", dpi),
		pdfPath,
		prefix,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("pdftoppm failed: %s: %w", string(output), err)
	}

	entries, err := os.ReadDir(outputDir)
	if err != nil {
		return nil, fmt.Errorf("read output dir: %w", err)
	}

	var pages []imagePage
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, fmt.Sprintf("tmp_%d_", dpi)) || !strings.HasSuffix(name, ".jpg") {
			continue
		}
		var num int
		if _, err := fmt.Sscanf(strings.TrimPrefix(name, fmt.Sprintf("tmp_%d_", dpi)), "%d", &num); err != nil {
			continue
		}
		pages = append(pages, imagePage{
			number: num,
			path:   filepath.Join(outputDir, name),
		})
	}

	return pages, nil
}

func isPDF(mimeType string) bool {
	return strings.Contains(mimeType, "pdf")
}

func isOfficeDocument(mimeType string) bool {
	officeTypes := []string{
		"application/vnd.openxmlformats-officedocument",
		"application/vnd.ms-excel",
		"application/msword",
		"application/vnd.ms-powerpoint",
		"application/vnd.oasis.opendocument",
		"application/x-doc",
		"application/x-xls",
		"application/x-ppt",
	}
	for _, t := range officeTypes {
		if strings.Contains(mimeType, t) {
			return true
		}
	}
	return false
}

func IsConvertible(mimeType string) bool {
	return isPDF(mimeType) || isOfficeDocument(mimeType)
}

func getImageDimensions(path string) (int, int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	cfg, _, err := image.DecodeConfig(f)
	if err != nil {
		return 0, 0, err
	}

	return cfg.Width, cfg.Height, nil
}
