package model

import "time"

type Tag struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Resource struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	MimeType         string    `json:"mimeType"`
	Size             int64     `json:"size"`
	StorageKey       string    `json:"-"`
	Checksum         string    `json:"-"`
	OcrText          string    `json:"ocrText,omitempty"`
	Tags             []Tag     `json:"tags"`
	IsFolder         bool      `json:"isFolder"`
	ParentResourceID string    `json:"parentResourceId,omitempty"`
	OwnerID          string    `json:"ownerId"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type Variant struct {
	ID          string `json:"id"`
	ResourceID  string `json:"resourceId"`
	VariantType string `json:"variantType"`
	PageNumber  int    `json:"pageNumber"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	StorageKey  string `json:"-"`
	MimeType    string `json:"mimeType"`
	GeneratedBy string `json:"generatedBy"`
	CreatedAt   string `json:"createdAt"`
}

type UploadResult struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	MimeType string `json:"mimeType"`
}
