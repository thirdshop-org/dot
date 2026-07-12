package handlers

import "github.com/vaultdrop/backend/internal/db"

type Handlers struct {
	queries *db.Queries
}

func New(queries *db.Queries) *Handlers {
	return &Handlers{queries: queries}
}
