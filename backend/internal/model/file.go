package model

type Tag struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	TagType string `json:"tagType"`
}

type File struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	MimeType     string `json:"mimeType"`
	Size         int64  `json:"size"`
	StorageKey   string `json:"-"`
	Checksum     string `json:"-"`
	OcrText      string `json:"ocrText,omitempty"`
	Tags         []Tag  `json:"tags"`
	IsFolder     bool   `json:"isFolder"`
	ParentFileID string `json:"parentFileId,omitempty"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type UploadResult struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}
