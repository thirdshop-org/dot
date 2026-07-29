package handler

import (
	"log"
	"net/http"
	"os"
	"path"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/auth"
	"github.com/vaultdrop/backend/internal/service"
	"github.com/vaultdrop/backend/pkg/api"
)

type ResourceHandler struct {
	resources  *service.ResourceService
	urls       *service.URLService
	ocr        *service.OCRService
	conversion *service.ConversionService
	broker     *service.EventBroker
}

func (h *ResourceHandler) Upload(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)

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
		result, err := h.resources.Upload(file, userID)
		if err != nil {
			api.Error(c, http.StatusInternalServerError, "UPLOAD_ERROR", err.Error())
			return
		}

		if err := h.ocr.Enqueue(result.ID, result.Path); err != nil {
			log.Printf("WARN %v", err)
		}

		if service.IsConvertible(result.MimeType) {
			if err := h.conversion.Enqueue(result.ID, result.Path, result.MimeType); err != nil {
				log.Printf("WARN %v", err)
			}
		}

		results = append(results, gin.H{
			"id":   result.ID,
			"name": result.Name,
		})

		h.broker.Publish("resource.created", result.ID)
	}

	api.Success(c, results)
}

func (h *ResourceHandler) List(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)
	thumbnailQuality := c.Query("thumbnail")

	resources, err := h.resources.List(userID)
	if err != nil {
		log.Printf("ERROR List resources: %v", err)
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list resources")
		return
	}

	type tagResponse struct {
		ID      string `json:"id"`
		TagName string `json:"tag_name"`
	}

	type resourceResponse struct {
		ID           string        `json:"id"`
		URL          string        `json:"url"`
		ThumbnailURL string        `json:"thumbnailUrl,omitempty"`
		Name         string        `json:"name"`
		Size         int64         `json:"size"`
		Tags         []tagResponse `json:"tags"`
		CreatedAt    string        `json:"createdAt"`
		MimeType     string        `json:"mimeType"`
		OcrText      string        `json:"ocrText,omitempty"`
		ParentID     string        `json:"parentResourceId,omitempty"`
		IsFolder     bool          `json:"isFolder"`
		UpdatedAt    string        `json:"updatedAt"`
		OwnerID      string        `json:"ownerId"`
	}

	resp := make([]resourceResponse, len(resources))
	for i, r := range resources {
		tags := []tagResponse{}
		for _, tag := range r.Tags {
			tags = append(tags, tagResponse{
				ID:      tag.ID,
				TagName: tag.Name,
			})
		}

		downloadURL := h.urls.GenerateDownloadURL(r.ID)
		thumbURL := downloadURL
		if thumbnailQuality != "" {
			if best := h.resources.GetBestVariant(r.ID, thumbnailQuality); best != nil {
				thumbURL = h.urls.GenerateVariantURL(best.ID)
			}
		}

		resp[i] = resourceResponse{
			ID:           r.ID,
			URL:          downloadURL,
			ThumbnailURL: thumbURL,
			Name:         r.Name,
			Size:         r.Size,
			Tags:         tags,
			CreatedAt:    r.CreatedAt.String(),
			ParentID:     r.ParentResourceID,
			OcrText:      r.OcrText,
			IsFolder:     r.IsFolder,
			UpdatedAt:    r.UpdatedAt.String(),
			MimeType:     r.MimeType,
			OwnerID:      r.OwnerID,
		}
	}

	api.Paginated(c, resp, 1, len(resp))
}

func (h *ResourceHandler) Download(c *gin.Context) {
	id := c.Param("id")
	exp, _ := strconv.ParseInt(c.Query("expires"), 10, 64)
	sig := c.Query("sig")

	if !h.urls.Validate(id, sig, exp) {
		api.Error(c, http.StatusForbidden, "FORBIDDEN", "Invalid or expired link")
		return
	}

	storagePath, err := h.resources.GetStoragePath(id)
	if err != nil {
		api.Error(c, http.StatusNotFound, "RESOURCE_NOT_FOUND", "Resource not found")
		return
	}

	c.File(path.Clean(storagePath))
}

func (h *ResourceHandler) Get(c *gin.Context) {
	id := c.Param("id")
	thumbnailQuality := c.Query("thumbnail")

	resource, err := h.resources.Get(id)
	if err != nil {
		api.Error(c, http.StatusNotFound, "RESOURCE_NOT_FOUND", "Resource not found")
		return
	}

	type tagResponse struct {
		ID      string `json:"id"`
		TagName string `json:"tag_name"`
	}

	type variantResponse struct {
		ID          string `json:"id"`
		PageNumber  int    `json:"pageNumber"`
		VariantType string `json:"variantType"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
		URL         string `json:"url"`
		MimeType    string `json:"mimeType"`
	}

	tags := []tagResponse{}
	for _, tag := range resource.Tags {
		tags = append(tags, tagResponse{
			ID:      tag.ID,
			TagName: tag.Name,
		})
	}

	downloadURL := h.urls.GenerateDownloadURL(resource.ID)
	thumbURL := downloadURL
	if thumbnailQuality != "" {
		if best := h.resources.GetBestVariant(resource.ID, thumbnailQuality); best != nil {
			thumbURL = h.urls.GenerateVariantURL(best.ID)
		}
	}

	dbVariants, _ := h.resources.GetVariantsByResourceID(resource.ID)
	variants := make([]variantResponse, len(dbVariants))
	for i, v := range dbVariants {
		variants[i] = variantResponse{
			ID:          v.ID,
			PageNumber:  v.PageNumber,
			VariantType: v.VariantType,
			Width:       v.Width,
			Height:      v.Height,
			URL:         h.urls.GenerateVariantURL(v.ID),
			MimeType:    v.MimeType,
		}
	}

	api.Success(c, gin.H{
		"id":           resource.ID,
		"name":         resource.Name,
		"url":          downloadURL,
		"thumbnailUrl": thumbURL,
		"size":         resource.Size,
		"mimeType":     resource.MimeType,
		"tags":         tags,
		"createdAt":    resource.CreatedAt,
		"updatedAt":    resource.UpdatedAt,
		"ocrText":      resource.OcrText,
		"isFolder":     resource.IsFolder,
		"parentResourceId": resource.ParentResourceID,
		"ownerId":      resource.OwnerID,
		"variants":     variants,
	})
}

func (h *ResourceHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	storagePath, _ := h.resources.GetStoragePath(id)
	variants, _ := h.resources.GetVariantsByResourceID(id)

	if err := h.resources.Delete(id); err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to delete resource")
		return
	}

	if storagePath != "" {
		os.Remove(path.Clean(storagePath))
	}
	for _, v := range variants {
		os.Remove(path.Clean(v.StorageKey))
	}

	api.Success(c, gin.H{"deleted": true})
}

func (h *ResourceHandler) AddTags(c *gin.Context) {
	id := c.Param("id")

	var body struct {
		Tags []string `json:"tags" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "Body must contain a 'tags' array")
		return
	}

	if err := h.resources.AddTags(id, body.Tags); err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to add tags")
		return
	}

	tags, err := h.resources.GetTagsByResourceID(id)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to fetch tags")
		return
	}

	api.Success(c, tags)
}

func (h *ResourceHandler) GetTags(c *gin.Context) {
	id := c.Param("id")
	tags, err := h.resources.GetTagsByResourceID(id)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to fetch tags")
		return
	}
	api.Success(c, tags)
}

func (h *ResourceHandler) MoveResources(c *gin.Context) {
	var body struct {
		ResourceIDs      []string `json:"resource_ids" binding:"required"`
		ParentResourceID *string  `json:"parent_resource_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "Body must contain 'resource_ids' array")
		return
	}

	if err := h.resources.MoveResources(body.ResourceIDs, body.ParentResourceID); err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to move resources")
		return
	}

	api.Success(c, gin.H{"moved": len(body.ResourceIDs)})
}

func (h *ResourceHandler) ListFolders(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)
	folders, err := h.resources.ListFolders(userID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list folders")
		return
	}
	api.Success(c, folders)
}

func (h *ResourceHandler) CreateFolder(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)

	var body struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "Body must contain 'name'")
		return
	}

	folder, err := h.resources.CreateFolder(body.Name, userID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to create folder")
		return
	}

	api.Success(c, folder)
}

func (h *ResourceHandler) ListByParent(c *gin.Context) {
	userID := c.GetString(auth.UserIDKey)
	parentID := c.Param("id")
	thumbnailQuality := c.Query("thumbnail")

	resources, err := h.resources.ListResourcesByParentID(parentID, userID)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list resources in folder")
		return
	}

	type tagResponse struct {
		ID      string `json:"id"`
		TagName string `json:"tag_name"`
	}

	type resourceResponse struct {
		ID           string        `json:"id"`
		URL          string        `json:"url"`
		ThumbnailURL string        `json:"thumbnailUrl,omitempty"`
		Name         string        `json:"name"`
		Size         int64         `json:"size"`
		Tags         []tagResponse `json:"tags"`
		CreatedAt    string        `json:"createdAt"`
		MimeType     string        `json:"mimeType"`
		OcrText      string        `json:"ocrText,omitempty"`
		ParentID     string        `json:"parentResourceId,omitempty"`
		IsFolder     bool          `json:"isFolder"`
		UpdatedAt    string        `json:"updatedAt"`
	}

	resp := make([]resourceResponse, len(resources))
	for i, r := range resources {
		tags := []tagResponse{}
		for _, tag := range r.Tags {
			tags = append(tags, tagResponse{
				ID:      tag.ID,
				TagName: tag.Name,
			})
		}

		downloadURL := h.urls.GenerateDownloadURL(r.ID)
		thumbURL := downloadURL
		if thumbnailQuality != "" {
			if best := h.resources.GetBestVariant(r.ID, thumbnailQuality); best != nil {
				thumbURL = h.urls.GenerateVariantURL(best.ID)
			}
		}

		resp[i] = resourceResponse{
			ID:           r.ID,
			URL:          downloadURL,
			ThumbnailURL: thumbURL,
			Name:         r.Name,
			Size:         r.Size,
			Tags:         tags,
			CreatedAt:    r.CreatedAt.String(),
			ParentID:     r.ParentResourceID,
			OcrText:      r.OcrText,
			IsFolder:     r.IsFolder,
			UpdatedAt:    r.UpdatedAt.String(),
			MimeType:     r.MimeType,
		}
	}

	api.Success(c, resp)
}

func (h *ResourceHandler) GetVariants(c *gin.Context) {
	id := c.Param("id")
	variants, err := h.resources.GetVariantsByResourceID(id)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to fetch variants")
		return
	}

	type variantResponse struct {
		ID          string `json:"id"`
		PageNumber  int    `json:"pageNumber"`
		VariantType string `json:"variantType"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
		URL         string `json:"url"`
		MimeType    string `json:"mimeType"`
	}

	resp := make([]variantResponse, len(variants))
	for i, v := range variants {
		resp[i] = variantResponse{
			ID:          v.ID,
			PageNumber:  v.PageNumber,
			VariantType: v.VariantType,
			Width:       v.Width,
			Height:      v.Height,
			URL:         h.urls.GenerateVariantURL(v.ID),
			MimeType:    v.MimeType,
		}
	}

	api.Success(c, resp)
}

func (h *ResourceHandler) ServeVariant(c *gin.Context) {
	id := c.Param("id")
	exp, _ := strconv.ParseInt(c.Query("expires"), 10, 64)
	sig := c.Query("sig")

	if !h.urls.Validate(id, sig, exp) {
		api.Error(c, http.StatusForbidden, "FORBIDDEN", "Invalid or expired link")
		return
	}

	storagePath, err := h.resources.GetVariantStoragePath(id)
	if err != nil {
		api.Error(c, http.StatusNotFound, "VARIANT_NOT_FOUND", "Variant not found")
		return
	}

	c.File(path.Clean(storagePath))
}

func (h *ResourceHandler) CheckDuplicates(c *gin.Context) {
	var body struct {
		Name     string `json:"name" binding:"required"`
		Size     int64  `json:"size" binding:"required"`
		MimeType string `json:"mime_type"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		api.Error(c, http.StatusBadRequest, "INVALID_BODY", "Body must contain 'name' and 'size'")
		return
	}

	duplicates, err := h.resources.FindDuplicatesByNameSize(body.Name, body.Size)
	if err != nil {
		api.Error(c, http.StatusInternalServerError, "DB_ERROR", "Failed to check duplicates")
		return
	}

	type dupResponse struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		MimeType  string `json:"mimeType"`
		Size      int64  `json:"size"`
		Checksum  string `json:"checksum"`
		CreatedAt string `json:"createdAt"`
	}

	resp := make([]dupResponse, len(duplicates))
	for i, d := range duplicates {
		resp[i] = dupResponse{
			ID:        d.ID.String(),
			Name:      d.Name,
			MimeType:  d.MimeType,
			Size:      d.Size,
			Checksum:  d.Checksum,
			CreatedAt: d.CreatedAt.Format("2006-01-02 15:04:05"),
		}
	}

	api.Success(c, gin.H{
		"duplicates": resp,
		"count":      len(resp),
	})
}
