package service

import (
	"testing"

	"github.com/vaultdrop/backend/models"
)

func TestMoveDocument(t *testing.T) {

	userAntoine, err := models.NewUser("antoine")
	if err != nil {
		t.Fatalf("creating antoine user: %v", err)
	}

	fakeUUID := "dsqdsq"
	document, err := models.NewDocument("test.pdf", models.FILE, 1)
	if err != nil {
		t.Fatalf("creating document: %v", err)
	}
	document.UUID = &fakeUUID

	folder, err := models.NewDocument("orga", models.DIRECTORY, 1)
	if err != nil {
		t.Fatalf("creating folder: %v", err)
	}
	folder.UUID = &fakeUUID

	service := New(userAntoine)

	if err := service.MoveDocumentIntoDocument(document, folder); err != nil {
		t.Error(err)
	}

}

func TestMoveDocumentToAFile(t *testing.T) {

	userAntoine, err := models.NewUser("antoine")
	if err != nil {
		t.Fatalf("creating antoine user: %v", err)
	}

	document, err := models.NewDocument("test.pdf", models.FILE, 1)
	if err != nil {
		t.Fatalf("creating document: %v", err)
	}

	notAFolder, err := models.NewDocument("orga", models.FILE, 1)
	if err != nil {
		t.Fatalf("creating file: %v", err)
	}

	service := New(userAntoine)

	err = service.MoveDocumentIntoDocument(document, notAFolder)

	if err == nil {
		t.Error(err)
	}

}