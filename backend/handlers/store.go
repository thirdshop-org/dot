package handlers

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
	"github.com/vaultdrop/backend/repository"
	"github.com/vaultdrop/backend/service"
)

// Store is the business layer used by handlers; set once at startup
// (cmd/server). Nil until then.
var Store *service.Resources

// Ocr queues/reads OCR jobs; set once at startup alongside Store.
var Ocr *service.Ocr

// writeError maps repository/service sentinels to contract error codes.
func writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		api.Error(c, 404, "NOT_FOUND", "resource not found")
	case errors.Is(err, repository.ErrGranteeNotFound):
		api.Error(c, 404, "GRANTEE_NOT_FOUND", "the specified user does not exist")
	case errors.Is(err, repository.ErrNameConflict):
		api.Error(c, 409, "NAME_CONFLICT", "a resource with this name already exists here")
	case errors.Is(err, service.ErrFileTooLarge):
		api.Error(c, 413, "FILE_TOO_LARGE", "file exceeds the maximum allowed size")
	default:
		api.Error(c, 500, "INTERNAL", err.Error())
	}
}
