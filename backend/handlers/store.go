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

// writeError maps repository/service sentinels to contract error codes.
func writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		api.Error(c, 404, "NOT_FOUND", "resource not found")
	case errors.Is(err, repository.ErrNameConflict):
		api.Error(c, 409, "NAME_CONFLICT", "a resource with this name already exists here")
	case errors.Is(err, service.FileTooLargeError):
		api.Error(c, 413, "FILE_TOO_LARGE", "file exceeds the maximum allowed size")
	default:
		api.Error(c, 500, "INTERNAL", err.Error())
	}
}
