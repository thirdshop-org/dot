package repository

import (
	"database/sql"
)

// Repository bundles all tables' repos.
type Repository struct {
	Resources *Resources
	Devices   *Devices
}

func NewRepository(conn *sql.DB) *Repository {
	return &Repository{
		Resources: &Resources{DB: conn},
		Devices:   &Devices{DB: conn},
	}
}
