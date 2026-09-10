package services

import (
	"fmt"

	"github.com/vaultdrop/backend/entities"
)

func (s *Services) MoveDocumentIntoDocument(from *entities.Document, to *entities.Document) error {

	if from.DocumentUUID == nil {
		return fmt.Errorf(entities.ERROR_DOCUMENT_NOT_PERCISTED)
	}

	if to.DocumentType != entities.DIRECTORY {
		return fmt.Errorf("The destination document must be a directory")
	}

	if canEdit, _ := UserCanEditDocument(s.ConnectedUser, from); canEdit == false {
		return fmt.Errorf("You can not edit this folder")
	}

	if canEdit, _ := UserCanEditDocument(s.ConnectedUser, to); canEdit == false {
		return fmt.Errorf("You can not edit this folder")
	}

	// Check if document exist and move the document into document if is directory

	fmt.Println("To implement move to ", to.DocumentUUID)

	return nil

}
