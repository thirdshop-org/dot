package service

import (
	"context"
	"database/sql"
	"encoding/hex"
	"fmt"
	"mime/multipart"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/db"
	"github.com/vaultdrop/backend/internal/model"
)

type FileService struct {
	queries *db.Queries
	cfg     *config.Config
}

func NewFileService(queries *db.Queries, cfg *config.Config) *FileService {
	return &FileService{queries: queries, cfg: cfg}
}

func (s *FileService) Upload(file *multipart.FileHeader) (*model.UploadResult, error) {
	dst := filepath.Join(s.cfg.UploadDir, uuid.New().String()+filepath.Ext(file.Filename))

	if err := os.MkdirAll(s.cfg.UploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	if err := saveUploadedFile(file, dst); err != nil {
		return nil, fmt.Errorf("save file: %w", err)
	}

	data, err := os.ReadFile(dst)
	if err != nil {
		return nil, fmt.Errorf("read saved file: %w", err)
	}

	info, err := os.Stat(dst)
	if err != nil {
		return nil, fmt.Errorf("stat file: %w", err)
	}

	id := uuid.New().String()
	checksum := hex.EncodeToString(CreateSHA256Hash(data))

	dbFile, err := s.queries.CreateFile(context.Background(), db.CreateFileParams{
		ID:         id,
		Name:       file.Filename,
		MimeType:   file.Header.Get("Content-Type"),
		Size:       info.Size(),
		StorageKey: dst,
		Checksum:   checksum,
	})
	if err != nil {
		return nil, fmt.Errorf("create file in db: %w", err)
	}

	return &model.UploadResult{
		ID:   dbFile.ID,
		Name: dbFile.Name,
		Path: dst,
	}, nil
}

func (s *FileService) List() ([]model.File, error) {
	dbFiles, err := s.queries.ListFiles(context.Background())
	if err != nil {
		return nil, fmt.Errorf("list files: %w", err)
	}

	files := make([]model.File, len(dbFiles))
	for i, f := range dbFiles {
		tags, err := s.queries.GetTagsByFileID(context.Background(), sql.NullString{String: f.ID, Valid: true})
		if err != nil {
			return nil, fmt.Errorf("get tags for file %s: %w", f.ID, err)
		}
		files[i] = dbToModel(f, tags)
	}
	return files, nil
}

func (s *FileService) Get(id string) (*model.File, error) {
	f, err := s.queries.GetFile(context.Background(), id)
	if err != nil {
		return nil, fmt.Errorf("get file: %w", err)
	}
	tags, err := s.queries.GetTagsByFileID(context.Background(), sql.NullString{String: f.ID, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("get tags: %w", err)
	}
	m := dbToModel(f, tags)
	return &m, nil
}

func (s *FileService) Delete(id string) error {
	return s.queries.DeleteFile(context.Background(), id)
}

func (s *FileService) GetStoragePath(id string) (string, error) {
	f, err := s.queries.GetFile(context.Background(), id)
	if err != nil {
		return "", fmt.Errorf("get file: %w", err)
	}
	return f.StorageKey, nil
}

func (s *FileService) UpdateOCRText(id, text string) error {
	f, err := s.queries.GetFile(context.Background(), id)
	if err != nil {
		return fmt.Errorf("get file: %w", err)
	}
	return s.queries.UpdateFile(context.Background(), db.UpdateFileParams{
		Name:     f.Name,
		MimeType: f.MimeType,
		OcrText:  text,
		ID:       id,
	})
}

func (s *FileService) AddTags(fileID string, tagNames []string) error {
	for _, name := range tagNames {
		tag, err := s.queries.GetTagByName(context.Background(), name)
		if err == sql.ErrNoRows {
			tag, err = s.queries.CreateTag(context.Background(), db.CreateTagParams{
				ID:      uuid.New().String(),
				TagName: name,
				TagType: "none",
			})
			if err != nil {
				return fmt.Errorf("create tag %q: %w", name, err)
			}
		} else if err != nil {
			return fmt.Errorf("get tag %q: %w", name, err)
		}

		err = s.queries.AddTagToFile(context.Background(), db.AddTagToFileParams{
			ID:     uuid.New().String(),
			TagID:  sql.NullString{String: tag.ID, Valid: true},
			FileID: sql.NullString{String: fileID, Valid: true},
		})
		if err != nil {
			return fmt.Errorf("link tag %q to file: %w", name, err)
		}
	}
	return nil
}

func (s *FileService) GetTagsByFileID(fileID string) ([]model.Tag, error) {
	dbTags, err := s.queries.GetTagsByFileID(context.Background(), sql.NullString{String: fileID, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("get tags: %w", err)
	}
	tags := make([]model.Tag, len(dbTags))
	for i, t := range dbTags {
		tags[i] = model.Tag{ID: t.ID, Name: t.TagName, TagType: t.TagType}
	}
	return tags, nil
}

func dbToModel(f db.File, dbTags []db.Tag) model.File {
	tags := make([]model.Tag, len(dbTags))
	for i, t := range dbTags {
		tags[i] = model.Tag{ID: t.ID, Name: t.TagName, TagType: t.TagType}
	}
	return model.File{
		ID:         f.ID,
		Name:       f.Name,
		MimeType:   f.MimeType,
		Size:       f.Size,
		StorageKey: f.StorageKey,
		Checksum:   f.Checksum,
		OcrText:    f.OcrText,
		Tags:       tags,
		CreatedAt:  f.CreatedAt.String(),
		UpdatedAt:  f.UpdatedAt.String(),
	}
}

func saveUploadedFile(file *multipart.FileHeader, dst string) error {
	src, err := file.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	buf := make([]byte, 32*1024)
	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, writeErr := out.Write(buf[:n]); writeErr != nil {
				return writeErr
			}
		}
		if readErr != nil {
			break
		}
	}
	return nil
}
