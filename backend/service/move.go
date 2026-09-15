package service

import (
	"errors"
	"fmt"

	"github.com/vaultdrop/backend/models"
)

func (s *Services) MoveDocumentIntoDocument(from *models.Document, to *models.Document) error {

	if from.UUID == nil {
		return errors.New(models.ERROR_DOCUMENT_NOT_PERCISTED)
	}

	if to.Type != models.DIRECTORY {
		return errors.New("the destination document must be a directory")
	}

	if canEdit, _ := UserCanEditDocument(s.ConnectedUser, from); !canEdit {
		return errors.New("you cannot edit this folder")
	}

	if canEdit, _ := UserCanEditDocument(s.ConnectedUser, to); !canEdit {
		return errors.New("you cannot edit this folder")
	}

	// Check if document exist and move the document into document if is directory

	fmt.Println("To implement move to ", to.UUID)

	return nil

}
