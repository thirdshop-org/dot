package services

import (
	"testing"

	"github.com/vaultdrop/backend/entities"
)

func TestMoveDocument(t *testing.T) {

	err, userAntoine := entities.NewUser("antoine")
	if err != nil {
		t.Errorf(`Error creating antoine user %v`, err)
	}

	fakeUUID := "dsqdsq"
	err, document := entities.NewDocument("test.pdf", entities.FILE)
	document.DocumentUUID = &fakeUUID

	err, folder := entities.NewDocument("orga", entities.DIRECTORY)
	folder.DocumentUUID = &fakeUUID

	service := New(userAntoine)

	err = service.MoveDocumentIntoDocument(document, folder)

	if err != nil {
		t.Error(err)
	}

}

func TestMoveDocumentToAFile(t *testing.T) {

	err, userAntoine := entities.NewUser("antoine")
	if err != nil {
		t.Errorf(`Error creating antoine user %v`, err)
	}

	err, document := entities.NewDocument("test.pdf", entities.FILE)

	err, notAFolder := entities.NewDocument("orga", entities.FILE)

	service := New(userAntoine)

	err = service.MoveDocumentIntoDocument(document, notAFolder)

	if err == nil {
		t.Error(err)
	}

}
