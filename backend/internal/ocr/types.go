package ocr

type OCRRequest struct {
	Image string `json:"image"`
}

type OCRResponse struct {
	ErrorCode int        `json:"errorCode"`
	Result    OCRResult  `json:"result"`
	Message   string     `json:"message,omitempty"`
}

type OCRResult struct {
	OCRResults []OCRPageResult `json:"ocrResults"`
}

type OCRPageResult struct {
	RecTexts  []string    `json:"rec_texts"`
	RecScores []float64   `json:"rec_scores"`
	RecBoxes  [][]int     `json:"rec_boxes"`
	RecPolys  [][][]int   `json:"rec_polys"`
}

type TextBlock struct {
	Text  string  `json:"text"`
	Score float64 `json:"score"`
}
