package ocr

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/ledongthuc/pdf"
)

// TesseractEngine runs the `tesseract` binary in a subprocess.
// Images are OCR'd directly; PDFs have their text layer extracted first
// (scanned PDFs → empty text, no rendering pipeline in V1).
type TesseractEngine struct{}

func NewTesseract() *TesseractEngine { return &TesseractEngine{} }

// ExtractText implements Engine.
func (t *TesseractEngine) ExtractText(ctx context.Context, filePath, lang string) (string, error) {
	if strings.ToLower(filepath.Ext(filePath)) == ".pdf" {
		return extractPDFText(filePath)
	}
	return runTesseract(ctx, filePath, lang)
}

func runTesseract(ctx context.Context, filePath, lang string) (string, error) {
	cmd := exec.CommandContext(ctx, "tesseract", filePath, "stdout", "-l", lang)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return "", ctx.Err()
		}
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", errors.New("tesseract: " + msg)
	}
	return strings.TrimSpace(stdout.String()), nil
}

func extractPDFText(filePath string) (string, error) {
	f, r, err := pdf.Open(filePath)
	if err != nil {
		return "", errors.New("pdf: " + err.Error())
	}
	defer f.Close()
	var builder strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		plain, err := p.GetPlainText(nil)
		if err != nil {
			continue
		}
		builder.WriteString(plain)
		builder.WriteString("\n")
	}
	return strings.TrimSpace(builder.String()), nil
}
