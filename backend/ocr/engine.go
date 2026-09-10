package ocr

import "context"

// Engine extracts text from a document (image or PDF) located at filePath.
// The V1 implementation is a Tesseract system call (OCR_LANG, défaut fra+eng);
// swapping to a remote service later only changes the injection point.
type Engine interface {
	ExtractText(ctx context.Context, filePath string, lang string) (string, error)
}
