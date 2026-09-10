package service

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/vaultdrop/backend/repository"
)

// FileTooLargeError signals an upload above MaxFileSize.
var FileTooLargeError = errors.New("file too large")

// FileDTO serializes exactly as mobile/api/types.ts FileDto.
type FileDTO struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Size      int64    `json:"size"`
	MimeType  string   `json:"mimeType,omitempty"`
	FolderID  string   `json:"folderId,omitempty"`
	Tags      []string `json:"tags,omitempty"`
	CreatedAt string   `json:"createdAt,omitempty"`
	UpdatedAt string   `json:"updatedAt,omitempty"`
}

// FolderDTO serializes exactly as mobile/api/types.ts FolderDto.
type FolderDTO struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parentId,omitempty"`
}

// Resources holds the business logic for files/folders list-get-delete-upload,
// always scoped by the requesting device.
type Resources struct {
	Repo        *repository.Resources
	Repository  *repository.Repository
	UploadDir   string
	MaxFileSize int64
}

func NewResources(repo *repository.Repository, uploadDir string, maxFileSize int64) *Resources {
	return &Resources{
		Repo:        repo.Resources,
		Repository:  repo,
		UploadDir:   uploadDir,
		MaxFileSize: maxFileSize,
	}
}

func (s *Resources) ListFiles(ownerID, folderID string, page, pageSize int, sort, order string) ([]FileDTO, int, error) {
	rows, total, err := s.Repo.ListFiles(ownerID, folderID, pageSize, (page-1)*pageSize, sort, order)
	if err != nil {
		return nil, 0, err
	}
	files := make([]FileDTO, 0, len(rows))
	for _, row := range rows {
		files = append(files, toFileDTO(row))
	}
	return files, total, nil
}

func (s *Resources) GetFile(ownerID, id string) (FileDTO, error) {
	row, err := s.Repo.GetFile(ownerID, id)
	if err != nil {
		return FileDTO{}, err
	}
	return toFileDTO(row), nil
}

func (s *Resources) DeleteFile(ownerID, id string) (string, error) {
	return s.Repo.DeleteFile(ownerID, id)
}

func (s *Resources) ListRootFolders(ownerID string) ([]FolderDTO, error) {
	rows, err := s.Repo.ListRootFolders(ownerID)
	if err != nil {
		return nil, err
	}
	folders := make([]FolderDTO, 0, len(rows))
	for _, row := range rows {
		folders = append(folders, FolderDTO{ID: row.ID, Name: row.Name, ParentID: row.ParentID})
	}
	return folders, nil
}

// Upload persists the multipart-sourced file under UploadDir/<device> and
// records its metadata, returning the FileDTO. The physical file is removed
// if metadata persistence fails (e.g. name conflict).
func (s *Resources) Upload(ownerID string, file *multipart.FileHeader, folderID string) (FileDTO, error) {
	if file.Size > s.MaxFileSize {
		return FileDTO{}, FileTooLargeError
	}

	id := repository.NewID()
	extension := strings.TrimPrefix(filepath.Ext(file.Filename), ".")
	destDir := filepath.Join(s.UploadDir, ownerID)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return FileDTO{}, fmt.Errorf("create upload dir: %w", err)
	}

	destPath := filepath.Join(destDir, id+"."+extension)
	if err := copyMultipart(file, destPath); err != nil {
		return FileDTO{}, err
	}

	mimeType := file.Header.Get("Content-Type")
	if err := s.Repo.InsertFile(ownerID, id, file.Filename, folderID, file.Size, &mimeType, &extension); err != nil {
		_ = os.Remove(destPath)
		return FileDTO{}, err
	}

	row, err := s.Repo.GetFile(ownerID, id)
	if err != nil {
		return FileDTO{}, err
	}
	return toFileDTO(row), nil
}

func copyMultipart(file *multipart.FileHeader, destPath string) error {
	src, err := file.Open()
	if err != nil {
		return fmt.Errorf("open multipart file: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("copy upload: %w", err)
	}
	return nil
}

func toFileDTO(row repository.FileRow) FileDTO {
	return FileDTO{
		ID:        row.ID,
		Name:      row.Name,
		Size:      row.Size,
		MimeType:  row.MimeType,
		FolderID:  row.FolderID,
		CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt: row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}
