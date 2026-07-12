package model

type OcrJob struct {
	ID          string  `json:"id"`
	FileID      string  `json:"fileId"`
	Status      string  `json:"status"`
	Result      string  `json:"result,omitempty"`
	CreatedAt   string  `json:"createdAt"`
	CompletedAt *string `json:"completedAt,omitempty"`
}
