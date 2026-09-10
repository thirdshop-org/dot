package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/pkg/api"
)

func intParam(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}

func FilesList(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	page := intParam(c.Query("page"), 1)
	pageSize := intParam(c.Query("pageSize"), 50)
	if pageSize > 200 {
		pageSize = 200
	}
	files, total, err := Store.ListFiles(deviceID, c.Query("folderId"), page, pageSize, c.Query("sort"), c.Query("order"))
	if err != nil {
		writeError(c, err)
		return
	}
	api.OKList(c, files, page, pageSize, total)
}

func FilesGet(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	id := c.Param("id")
	if !deviceIDPattern.MatchString(id) {
		api.Error(c, http.StatusNotFound, "NOT_FOUND", "file not found")
		return
	}
	file, err := Store.GetFile(deviceID, id)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OK(c, file)
}

func FilesDelete(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	id := c.Param("id")
	if !deviceIDPattern.MatchString(id) {
		api.Error(c, http.StatusNotFound, "NOT_FOUND", "file not found")
		return
	}
	deletedID, err := Store.DeleteFile(deviceID, id)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OK(c, gin.H{"id": deletedID})
}

func FilesUpload(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	folderID := c.PostForm("folderId")

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, Store.MaxFileSize+1)
	file, err := c.FormFile("file")
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			api.Error(c, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "file exceeds the maximum allowed size")
			return
		}
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "missing multipart field `file`")
		return
	}
	if file.Size > Store.MaxFileSize {
		api.Error(c, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "file exceeds the maximum allowed size")
		return
	}

	dto, err := Store.Upload(deviceID, file, folderID)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OK(c, dto)
}

func FoldersList(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	folders, err := Store.ListRootFolders(deviceID)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OK(c, folders)
}

func FilesSearch(c *gin.Context) {
	if Store == nil {
		api.Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "backend not initialized")
		return
	}
	deviceID := c.GetString(DeviceIDKey)
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		api.Error(c, http.StatusBadRequest, "INVALID_REQUEST", "missing required query param `q`")
		return
	}
	page := intParam(c.Query("page"), 1)
	pageSize := intParam(c.Query("pageSize"), 50)
	if pageSize > 200 {
		pageSize = 200
	}
	files, total, err := Store.SearchFiles(deviceID, q, page, pageSize)
	if err != nil {
		writeError(c, err)
		return
	}
	api.OKList(c, files, page, pageSize, total)
}
