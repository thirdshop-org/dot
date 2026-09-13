package service

import (
	"bytes"
	"errors"
	"mime/multipart"
	"os"
	"path/filepath"
	"testing"

	"github.com/vaultdrop/backend/repository"
)

func multipartFileHeader(t *testing.T, filename string, content []byte) *multipart.FileHeader {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	reader := multipart.NewReader(&body, writer.Boundary())
	form, err := reader.ReadForm(1 << 20)
	if err != nil {
		t.Fatalf("read form: %v", err)
	}
	files := form.File["file"]
	if len(files) == 0 {
		t.Fatal("aucun fichier dans la forme")
	}
	return files[0]
}

func TestUploadPersistsPhysicalFile(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "upload-happy")

	dto, err := s.Upload(userID, multipartFileHeader(t, "docs.txt", []byte("hello")), "")
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if dto.ID == "" || dto.Name != "docs.txt" {
		t.Errorf("dto inattendu: %+v", dto)
	}

	// Le fichier physique existe sous UploadDir/<user>/<id>.<ext>.
	path := filepath.Join(s.UploadDir, userID, dto.ID+".txt")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("fichier physique absent: %v", err)
	}
	if info.Size() != 5 {
		t.Errorf("taille physique = %d, attendu 5", info.Size())
	}
}

func TestUploadRemovesPhysicalFileOnNameConflict(t *testing.T) {
	s := newServiceStore(t)
	userID := mustCreateUser(t, s.Repository, "upload-conflict")
	folderID := repository.NewID()
	if err := s.Repository.Resources.InsertFolder(userID, folderID, "Docs", ""); err != nil {
		t.Fatalf("insert folder: %v", err)
	}

	target := multipartFileHeader(t, "dupe.txt", []byte("hello"))
	first, err := s.Upload(userID, target, folderID)
	if err != nil {
		t.Fatalf("premier upload: %v", err)
	}
	if first.ID == "" {
		t.Fatal("aucun id au premier upload")
	}

	// Même nom, même dossier → NAME_CONFLICT et pas de second fichier physique.
	if _, err := s.Upload(userID, target, folderID); !errors.Is(err, repository.ErrNameConflict) {
		t.Fatalf("second upload : attendu ErrNameConflict, got %v", err)
	}

	entries, err := os.ReadDir(filepath.Join(s.UploadDir, userID))
	if err != nil {
		t.Fatalf("readdir: %v", err)
	}
	if len(entries) != 1 {
		t.Errorf("fichier orphelin laissé après NAME_CONFLICT : %d fichiers", len(entries))
	}
}
