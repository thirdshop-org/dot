package services

import "github.com/vaultdrop/backend/entities"

// import "github.com/vaultdrop/backend/entities"

type Services struct {
	ConnectedUser *entities.User
}

func New(connectedUser *entities.User) *Services {

	return &Services{
		ConnectedUser: connectedUser,
	}

}

func UserCanReadDocument(connectedUser *entities.User, document *entities.Document) (bool, string) {
	return true, ""
}

func UserCanEditDocument(connectedUser *entities.User, document *entities.Document) (bool, string) {
	return true, ""
}

func UserCanDeleteDocument(connectedUser *entities.User, document *entities.Document) (bool, string) {
	return true, ""
}

func UserCanCreateDocument(connectedUser *entities.User, document *entities.Document) (bool, string) {
	return true, ""
}
