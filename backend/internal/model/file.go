package model

type File struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	MimeType   string `json:"mimeType"`
	Size       int64  `json:"size"`
	StorageKey string `json:"-"`
	Checksum   string `json:"-"`
	OcrText    string `json:"ocrText,omitempty"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type UploadResult struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
