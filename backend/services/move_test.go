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

	err, document := entities.NewDocument("test.pdf", entities.FILE)

	err, folder := entities.NewDocument("orga", entities.DIRECTORY)

	service := New(userAntoine)

	err := service.MoveDocumentIntoDocument(document, folder)

}
