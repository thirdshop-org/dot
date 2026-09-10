package service

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/vaultdrop/backend/ocr"
	"github.com/vaultdrop/backend/repository"
)

// OcrJobDTO serializes exactly as mobile/api/types.ts OcrJob.
type OcrJobDTO struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Text   string `json:"text,omitempty"`
	Error  string `json:"error,omitempty"`
}

// Ocr queues OCR jobs and processes them asynchronously (V1 : goroutine par
// job ; le client poll GET /ocr/jobs/:id toutes les 3s).
type Ocr struct {
	Repository *repository.Repository
	UploadDir  string
	Lang       string
	Engine     ocr.Engine
}

func NewOcr(repo *repository.Repository, uploadDir, lang string, engine ocr.Engine) *Ocr {
	return &Ocr{Repository: repo, UploadDir: uploadDir, Lang: lang, Engine: engine}
}

// Create valide la ressource (ownership par user), met le job en file et
// lance le traitement. Le job reste scopé par device (le service génère les
// jobs du device courant ; l'outbox OCR n'est pas synchronisée entre devices).
func (o *Ocr) Create(userID, deviceID, fileID string) (OcrJobDTO, error) {
	if _, err := o.Repository.Resources.GetFile(userID, fileID); err != nil {
		return OcrJobDTO{}, err
	}
	jobID := repository.NewID()
	if err := o.Repository.OcrJobs.Create(jobID, deviceID, fileID); err != nil {
		return OcrJobDTO{}, err
	}
	go o.process(userID, deviceID, jobID, fileID)
	return OcrJobDTO{ID: jobID, Status: "queued"}, nil
}

func (o *Ocr) Get(deviceID, jobID string) (OcrJobDTO, error) {
	row, err := o.Repository.OcrJobs.Get(deviceID, jobID)
	if err != nil {
		return OcrJobDTO{}, err
	}
	return toOcrJobDTO(row), nil
}

func (o *Ocr) process(userID, deviceID, jobID, fileID string) {
	ctx := context.Background()
	if err := o.Repository.OcrJobs.TouchProcessing(deviceID, jobID); err != nil {
		return
	}
	path, err := o.physicalPath(userID, fileID)
	if err != nil {
		_ = o.Repository.OcrJobs.Fail(deviceID, jobID, "file not readable")
		return
	}
	text, err := o.Engine.ExtractText(ctx, path, o.Lang)
	if err != nil {
		_ = o.Repository.OcrJobs.Fail(deviceID, jobID, err.Error())
		return
	}
	_ = o.Repository.OcrJobs.Complete(deviceID, jobID, text)
}

// physicalPath résout UPLOAD_DIR/<user_id>/<resource_id>.<ext> — l'ext est
// choisi à l'upload, le fichier réel est retrouvé par préfixe.
func (o *Ocr) physicalPath(userID, fileID string) (string, error) {
	matches, err := filepath.Glob(filepath.Join(o.UploadDir, userID, fileID+".*"))
	if err != nil {
		return "", err
	}
	for _, m := range matches {
		if strings.HasPrefix(filepath.Base(m), fileID+".") {
			return m, nil
		}
	}
	return "", repository.ErrNotFound
}

func toOcrJobDTO(row repository.OcrJobRow) OcrJobDTO {
	dto := OcrJobDTO{ID: row.ID, Status: row.Status}
	if row.Text != nil {
		dto.Text = *row.Text
	}
	if row.Error != nil {
		dto.Error = *row.Error
	}
	return dto
}
