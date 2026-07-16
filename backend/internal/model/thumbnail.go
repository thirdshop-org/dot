package model

type Thumbnail struct {
	ID              string `json:"id"`
	FileID          string `json:"fileId"`
	PageNumber      int    `json:"pageNumber"`
	ResolutionLabel string `json:"resolutionLabel"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	StorageKey      string `json:"-"`
	MimeType        string `json:"mimeType"`
	CreatedAt       string `json:"createdAt"`
}
