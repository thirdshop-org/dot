package handler

import (
	"net/http"
	"path"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type FileHandler struct {
	files *service.FileService
	urls  *service.URLService
	ocr   *service.OCRService
}

func (h *FileHandler) Upload(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		api.Error(c, http.StatusBadRequest, "ERROR_PARSING", "Error while parsing multipart form")
		return
	}

	files := form.File["file"]
	if len(files) == 0 {
		api.Error(c, http.StatusBadRequest, "NO_FILES", "No files provided")
		return
	}

	results := make([]gin.H, 0, len(files))
	for _, file := range files {
		result, err := h.files.Upload(file)
		if err != nil {
			api.Error(c, http.StatusInternalServerError, "UPLOAD_ERROR", err.Error())
			return
		}

		h.ocr.Enqueue(result.ID, result.Path)

		results = append(results, gin.H{
			"id":   result.ID,
			"name": result.Name,
		})
	}

	api.Success(c, results)
}

func (h *FileHandler) List(c *gin.Context) {
	files, err := h.files.List()
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list files")
		return
	}

	type fileResponse struct {
		ID        string   `json:"id"`
		URL       string   `json:"url"`
		Name      string   `json:"name"`
		Size      int64    `json:"size"`
		Tags      []string `json:"tags"`
		CreatedAt string   `json:"createdAt"`
		MimeType  string   `json:"mimeType"`
		OcrText   string   `json:"ocrText,omitempty"`
		NlpData   string   `json:"nlpData,omitempty"`
		UpdatedAt string   `json:"updatedAt"`
	}

	resp := make([]fileResponse, len(files))
	for i, f := range files {

		resp[i] = fileResponse{
			ID:        f.ID,
			URL:       h.urls.GenerateDownloadURL(f.ID),
			Name:      f.Name,
			Size:      f.Size,
			Tags:      []string{},
			CreatedAt: f.CreatedAt,
			OcrText:   f.OcrText,
			NlpData:   f.NlpData,
			UpdatedAt: f.UpdatedAt,
			MimeType:  f.MimeType,
		}
	}

	api.Paginated(c, resp, 1, len(resp))
}

func (h *FileHandler) Download(c *gin.Context) {
	id := c.Param("id")
	exp, _ := strconv.ParseInt(c.Query("expires"), 10, 64)
	sig := c.Query("sig")

	if !h.urls.Validate(id, sig, exp) {
		api.Error(c, http.StatusForbidden, "FORBIDDEN", "Invalid or expired link")
		return
	}

	storagePath, err := h.files.GetStoragePath(id)
	if err != nil {
		api.Error(c, http.StatusNotFound, "FILE_NOT_FOUND", "File not found")
		return
	}

	c.File(path.Clean(storagePath))
}

func (h *FileHandler) Get(c *gin.Context) {
	id := c.Param("id")
	file, err := h.files.Get(id)
	if err != nil {
		api.Error(c, http.StatusNotFound, "FILE_NOT_FOUND", "File not found")
		return
	}

	api.Success(c, gin.H{
		"id":        file.ID,
		"name":      file.Name,
		"url":       h.urls.GenerateDownloadURL(file.ID),
		"size":      file.Size,
		"mimeType":  file.MimeType,
		"createdAt": file.CreatedAt,
		"updatedAt": file.UpdatedAt,
		"ocrText":   file.OcrText,
		"nlpData":   file.NlpData,
	})
}

func (h *FileHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.files.Delete(id); err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to delete file")
		return
	}
	api.Success(c, gin.H{"deleted": true})
}

func (h *FileHandler) AddTags(c *gin.Context) {
	api.Error(c, http.StatusNotImplemented, "NOT_IMPLEMENTED", "Tags not yet implemented")
}

func (h *FileHandler) GetTags(c *gin.Context) {
	api.Success(c, []interface{}{})
}
