package services

import (
	"fmt"

	"github.com/vaultdrop/backend/entities"
)

func (s *Services) UploadDocument(file *string, destination *entities.Document) error {

	if canEdit, _ := UserCanEditDocument(s.ConnectedUser, destination); !canEdit {
		return fmt.Errorf("Can not edit")
	}

	entities.NewDocument("test", entities.FILE)

	return nil

}
