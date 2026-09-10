package service

import "github.com/vaultdrop/backend/models"

func (s *Services) CreateFolder(folderName string, destination *models.Document) (error, *models.Document) {

	err, directory := models.NewDocument(folderName, models.DIRECTORY, 1)
	if err != nil {
		return err, nil
	}

	return nil, directory

}
