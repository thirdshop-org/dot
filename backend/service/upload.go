package service

import (
	"fmt"

	"github.com/vaultdrop/backend/models"
)

func (s *Services) UploadDocument(file *string, destination *models.Document) error {

	if canEdit, _ := UserCanEditDocument(s.ConnectedUser, destination); !canEdit {
		return fmt.Errorf("Can not edit")
	}

	models.NewDocument("test", models.FILE, 1)

	return nil

}
