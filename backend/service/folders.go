package service

import "github.com/vaultdrop/backend/models"

func (s *Services) CreateFolder(folderName string, destination *models.Document) (*models.Document, error) {

	directory, err := models.NewDocument(folderName, models.DIRECTORY, 1)
	if err != nil {
		return nil, err
	}

	return directory, nil

}
