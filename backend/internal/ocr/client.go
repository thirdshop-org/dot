package ocr

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/ledongthuc/pdf"
)

type Client struct {
	endpoint   string
	httpClient *http.Client
}

func NewClient(endpoint string) *Client {
	return &Client{
		endpoint: endpoint,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

func (c *Client) Recognize(imageData []byte) ([]TextBlock, error) {

	docType := DetectDocumentType(imageData)

	switch docType {
	case PDFScanned:
		fmt.Println("PDFScanned -> PaddleOCR")
	case PDFText:
		fmt.Println("PDFText -> PaddleOCR")
	case Image:
		fmt.Println("Image -> PaddleOCR")
	default:
		return []TextBlock{}, fmt.Errorf("DOCTYPE not supported => %s", docType)
	}

	b64 := base64.StdEncoding.EncodeToString(imageData)

	reqBody, err := json.Marshal(OCRRequest{Image: b64})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.endpoint+"/ocr",
		"application/json",
		bytes.NewReader(reqBody),
	)
	if err != nil {
		return nil, fmt.Errorf("call paddleocr: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("paddleocr returned %d: %s", resp.StatusCode, string(body))
	}

	var ocrResp OCRResponse
	if err := json.Unmarshal(body, &ocrResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if ocrResp.ErrorCode != 0 {
		return nil, fmt.Errorf("paddleocr error %d: %s", ocrResp.ErrorCode, ocrResp.Message)
	}

	return flattenResults(ocrResp.Result), nil
}

type DocType string

const (
	Image      DocType = "image"
	PDFText    DocType = "pdf_text"
	PDFScanned DocType = "pdf_scanned"
	Unknown    DocType = "unknown"
)

func isPDFText(data []byte) bool {
	reader := bytes.NewReader(data)

	r, err := pdf.NewReader(reader, int64(len(data)))
	if err != nil {
		return false
	}

	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}

		text, _ := page.GetPlainText(nil)
		if len(text) > 20 {
			return true
		}
	}

	return false
}

func DetectDocumentType(data []byte) DocType {
	mime := http.DetectContentType(data)

	switch {
	case mime == "application/pdf":
		if isPDFText(data) {
			return PDFText
		}
		return PDFScanned

	case bytes.HasPrefix(data, []byte{0xFF, 0xD8}): // JPEG
		return Image

	case bytes.HasPrefix(data, []byte{0x89, 0x50, 0x4E, 0x47}): // PNG
		return Image

	default:
		return Unknown
	}
}

func (c *Client) HealthCheck() error {
	resp, err := c.httpClient.Get(c.endpoint + "/health")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check failed: status %d", resp.StatusCode)
	}
	return nil
}

func flattenResults(result OCRResult) []TextBlock {
	var blocks []TextBlock
	for _, page := range result.OCRResults {
		for i, text := range page.RecTexts {
			score := 0.0
			if i < len(page.RecScores) {
				score = page.RecScores[i]
			}
			blocks = append(blocks, TextBlock{Text: text, Score: score})
		}
	}
	return blocks
}
