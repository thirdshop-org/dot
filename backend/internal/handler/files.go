package handler

import (
	"log"
	"net/http"
	"path"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type FileHandler struct {
	files      *service.FileService
	urls       *service.URLService
	ocr        *service.OCRService
	conversion *service.ConversionService
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

		if service.IsConvertible(result.MimeType) {
			h.conversion.Enqueue(result.ID, result.Path, result.MimeType)
		}

		results = append(results, gin.H{
			"id":   result.ID,
			"name": result.Name,
		})
	}

	api.Success(c, results)
}

func (h *FileHandler) List(c *gin.Context) {
	thumbnailQuality := c.Query("thumbnail")

	files, err := h.files.List()
	if err != nil {
		log.Printf("ERROR List files: %v", err)
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list files")
		return
	}

	type tagResponse struct {
		ID      string `json:"id"`
		TagName string `json:"tag_name"`
		TagType string `json:"tag_type"`
	}

	type fileResponse struct {
		ID           string        `json:"id"`
		URL          string        `json:"url"`
		ThumbnailURL string        `json:"thumbnailUrl,omitempty"`
		Name         string        `json:"name"`
		Size         int64         `json:"size"`
		Tags         []tagResponse `json:"tags"`
		CreatedAt    string        `json:"createdAt"`
		MimeType     string        `json:"mimeType"`
		OcrText      string        `json:"ocrText,omitempty"`
		ParentFileID string        `json:"parentFileID,omitempty"`
		IsFolder     bool          `json:"isFolder"`
		UpdatedAt    string        `json:"updatedAt"`
	}

	resp := make([]fileResponse, len(files))
	for i, f := range files {
		tags := []tagResponse{}
		for _, tag := range f.Tags {
			tags = append(tags, tagResponse{
				ID:      tag.ID,
				TagName: tag.Name,
				TagType: tag.TagType,
			})
		}

		downloadURL := h.urls.GenerateDownloadURL(f.ID)
		thumbURL := downloadURL
		if thumbnailQuality != "" {
			if best := h.files.GetBestThumbnail(f.ID, thumbnailQuality); best != nil {
				thumbURL = h.urls.GenerateThumbnailURL(best.ID)
			}
		}

		resp[i] = fileResponse{
			ID:           f.ID,
			URL:          downloadURL,
			ThumbnailURL: thumbURL,
			Name:         f.Name,
			Size:         f.Size,
			Tags:         tags,
			CreatedAt:    f.CreatedAt,
			ParentFileID: f.ParentFileID,
			OcrText:      f.OcrText,
			IsFolder:     f.IsFolder,
			UpdatedAt:    f.UpdatedAt,
			MimeType:     f.MimeType,
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
	thumbnailQuality := c.Query("thumbnail")

	file, err := h.files.Get(id)
	if err != nil {
		api.Error(c, http.StatusNotFound, "FILE_NOT_FOUND", "File not found")
		return
	}

	type tagResponse struct {
		ID      string `json:"id"`
		TagName string `json:"tag_name"`
		TagType string `json:"tag_type"`
	}

	type thumbnailResponse struct {
		ID              string `json:"id"`
		PageNumber      int    `json:"pageNumber"`
		ResolutionLabel string `json:"resolutionLabel"`
		Width           int    `json:"width"`
		Height          int    `json:"height"`
		URL             string `json:"url"`
		MimeType        string `json:"mimeType"`
	}

	tags := []tagResponse{}
	for _, tag := range file.Tags {
		tags = append(tags, tagResponse{
			ID:      tag.ID,
			TagName: tag.Name,
			TagType: tag.TagType,
		})
	}

	downloadURL := h.urls.GenerateDownloadURL(file.ID)
	thumbURL := downloadURL
	if thumbnailQuality != "" {
		if best := h.files.GetBestThumbnail(file.ID, thumbnailQuality); best != nil {
			thumbURL = h.urls.GenerateThumbnailURL(best.ID)
		}
	}

	dbThumbnails, _ := h.files.GetThumbnailsByFileID(file.ID)
	thumbnails := make([]thumbnailResponse, len(dbThumbnails))
	for i, t := range dbThumbnails {
		thumbnails[i] = thumbnailResponse{
			ID:              t.ID,
			PageNumber:      t.PageNumber,
			ResolutionLabel: t.ResolutionLabel,
			Width:           t.Width,
			Height:          t.Height,
			URL:             h.urls.GenerateThumbnailURL(t.ID),
			MimeType:        t.MimeType,
		}
	}

	api.Success(c, gin.H{
		"id":           file.ID,
		"name":         file.Name,
		"url":          downloadURL,
		"thumbnailUrl": thumbURL,
		"size":         file.Size,
		"mimeType":     file.MimeType,
		"tags":         tags,
		"createdAt":    file.CreatedAt,
		"updatedAt":    file.UpdatedAt,
		"ocrText":      file.OcrText,
		"isFolder":     file.IsFolder,
		"parentFileID": file.ParentFileID,
		"thumbnails":   thumbnails,
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
	id := c.Param("id")

	var body struct {
		Tags    []string `json:"tags" binding:"required"`
		TagType string   `json:"tag_type"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "Body must contain a 'tags' array")
		return
	}

	tagType := body.TagType
	if tagType == "" {
		tagType = "none"
	}

	if err := h.files.AddTags(id, body.Tags, tagType); err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to add tags")
		return
	}

	tags, err := h.files.GetTagsByFileID(id)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to fetch tags")
		return
	}

	api.Success(c, tags)
}

func (h *FileHandler) GetTags(c *gin.Context) {
	id := c.Param("id")
	tags, err := h.files.GetTagsByFileID(id)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to fetch tags")
		return
	}
	api.Success(c, tags)
}

func (h *FileHandler) MoveFiles(c *gin.Context) {
	var body struct {
		FileIDs       []string `json:"file_ids" binding:"required"`
		ParentFileID  *string  `json:"parent_file_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "Body must contain 'file_ids' array")
		return
	}

	if err := h.files.MoveFiles(body.FileIDs, body.ParentFileID); err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to move files")
		return
	}

	api.Success(c, gin.H{"moved": len(body.FileIDs)})
}

func (h *FileHandler) ListFolders(c *gin.Context) {
	folders, err := h.files.ListFolders()
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list folders")
		return
	}
	api.Success(c, folders)
}

func (h *FileHandler) CreateFolder(c *gin.Context) {
	var body struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "Body must contain 'name'")
		return
	}

	folder, err := h.files.CreateFolder(body.Name)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to create folder")
		return
	}

	api.Success(c, folder)
}

func (h *FileHandler) ListFilesByParent(c *gin.Context) {
	parentID := c.Param("id")
	thumbnailQuality := c.Query("thumbnail")

	files, err := h.files.ListFilesByParentID(parentID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list files in folder")
		return
	}

	type tagResponse struct {
		ID      string `json:"id"`
		TagName string `json:"tag_name"`
		TagType string `json:"tag_type"`
	}

	type fileResponse struct {
		ID           string        `json:"id"`
		URL          string        `json:"url"`
		ThumbnailURL string        `json:"thumbnailUrl,omitempty"`
		Name         string        `json:"name"`
		Size         int64         `json:"size"`
		Tags         []tagResponse `json:"tags"`
		CreatedAt    string        `json:"createdAt"`
		MimeType     string        `json:"mimeType"`
		OcrText      string        `json:"ocrText,omitempty"`
		ParentFileID string        `json:"parentFileID,omitempty"`
		IsFolder     bool          `json:"isFolder"`
		UpdatedAt    string        `json:"updatedAt"`
	}

	resp := make([]fileResponse, len(files))
	for i, f := range files {
		tags := []tagResponse{}
		for _, tag := range f.Tags {
			tags = append(tags, tagResponse{
				ID:      tag.ID,
				TagName: tag.Name,
				TagType: tag.TagType,
			})
		}

		downloadURL := h.urls.GenerateDownloadURL(f.ID)
		thumbURL := downloadURL
		if thumbnailQuality != "" {
			if best := h.files.GetBestThumbnail(f.ID, thumbnailQuality); best != nil {
				thumbURL = h.urls.GenerateThumbnailURL(best.ID)
			}
		}

		resp[i] = fileResponse{
			ID:           f.ID,
			URL:          downloadURL,
			ThumbnailURL: thumbURL,
			Name:         f.Name,
			Size:         f.Size,
			Tags:         tags,
			CreatedAt:    f.CreatedAt,
			ParentFileID: f.ParentFileID,
			OcrText:      f.OcrText,
			IsFolder:     f.IsFolder,
			UpdatedAt:    f.UpdatedAt,
			MimeType:     f.MimeType,
		}
	}

	api.Success(c, resp)
}

func (h *FileHandler) GetThumbnails(c *gin.Context) {
	id := c.Param("id")
	thumbnails, err := h.files.GetThumbnailsByFileID(id)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to fetch thumbnails")
		return
	}

	type thumbnailResponse struct {
		ID              string `json:"id"`
		PageNumber      int    `json:"pageNumber"`
		ResolutionLabel string `json:"resolutionLabel"`
		Width           int    `json:"width"`
		Height          int    `json:"height"`
		URL             string `json:"url"`
		MimeType        string `json:"mimeType"`
	}

	resp := make([]thumbnailResponse, len(thumbnails))
	for i, t := range thumbnails {
		resp[i] = thumbnailResponse{
			ID:              t.ID,
			PageNumber:      t.PageNumber,
			ResolutionLabel: t.ResolutionLabel,
			Width:           t.Width,
			Height:          t.Height,
			URL:             h.urls.GenerateThumbnailURL(t.ID),
			MimeType:        t.MimeType,
		}
	}

	api.Success(c, resp)
}

func (h *FileHandler) ServeThumbnail(c *gin.Context) {
	id := c.Param("id")
	exp, _ := strconv.ParseInt(c.Query("expires"), 10, 64)
	sig := c.Query("sig")

	if !h.urls.Validate(id, sig, exp) {
		api.Error(c, http.StatusForbidden, "FORBIDDEN", "Invalid or expired link")
		return
	}

	storagePath, err := h.files.GetThumbnailStoragePath(id)
	if err != nil {
		api.Error(c, http.StatusNotFound, "THUMBNAIL_NOT_FOUND", "Thumbnail not found")
		return
	}

	c.File(path.Clean(storagePath))
}
