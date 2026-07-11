package models

import "time"

type File struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	MimeType  string    `json:"mimeType"`
	Size      int64     `json:"size"`
	Path      string    `json:"-"`
	OcrText   string    `json:"ocrText,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Tag struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type OcrJob struct {
	ID          string     `json:"id"`
	FileID      string     `json:"fileId"`
	Status      string     `json:"status"`
	Result      string     `json:"result,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
}

type PaginatedResponse struct {
	Data interface{} `json:"data"`
	Meta struct {
		Page  int `json:"page"`
		Total int `json:"total"`
	} `json:"meta"`
}

type ErrorResponse struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}
