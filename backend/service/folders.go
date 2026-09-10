package services

import "github.com/vaultdrop/backend/entities"

func (s *Services) CreateFolder(folderName string, destination *entities.Document) (error, *entities.Document) {

	err, directory := entities.NewDocument(folderName, entities.DIRECTORY)
	if err != nil {
		return err, nil
	}

	return nil, directory

}
