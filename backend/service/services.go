package service

import "github.com/vaultdrop/backend/models"

type Services struct {
	ConnectedUser *models.User
}

func New(connectedUser *models.User) *Services {

	return &Services{
		ConnectedUser: connectedUser,
	}

}

func UserCanReadDocument(connectedUser *models.User, document *models.Document) (bool, string) {
	return true, ""
}

func UserCanEditDocument(connectedUser *models.User, document *models.Document) (bool, string) {
	return true, ""
}

func UserCanDeleteDocument(connectedUser *models.User, document *models.Document) (bool, string) {
	return true, ""
}

func UserCanCreateDocument(connectedUser *models.User, document *models.Document) (bool, string) {
	return true, ""
}
