package service

import (
	"testing"

	"github.com/vaultdrop/backend/models"
)

func TestMoveDocument(t *testing.T) {

	err, userAntoine := models.NewUser("antoine")
	if err != nil {
		t.Errorf(`Error creating antoine user %v`, err)
	}

	fakeUUID := "dsqdsq"
	err, document := models.NewDocument("test.pdf", models.FILE, 1)
	document.UUID = &fakeUUID

	err, folder := models.NewDocument("orga", models.DIRECTORY, 1)
	folder.UUID = &fakeUUID

	service := New(userAntoine)

	err = service.MoveDocumentIntoDocument(document, folder)

	if err != nil {
		t.Error(err)
	}

}

func TestMoveDocumentToAFile(t *testing.T) {

	err, userAntoine := models.NewUser("antoine")
	if err != nil {
		t.Errorf(`Error creating antoine user %v`, err)
	}

	err, document := models.NewDocument("test.pdf", models.FILE, 1)

	err, notAFolder := models.NewDocument("orga", models.FILE, 1)

	service := New(userAntoine)

	err = service.MoveDocumentIntoDocument(document, notAFolder)

	if err == nil {
		t.Error(err)
	}

}