package entities

import (
	"fmt"
)

type Document struct {
	DocumentUUID         *string
	DocumentType         int
	DocumentName         *string
	DocumentOriginalName string
}

const (
	ERROR_DOCUMENT_TYPE          = "ERROR_DOCUMENT_TYPE"
	ERROR_DOCUMENT_MOVE          = "ERROR_DOCUMENT_MOVE"
	ERROR_DOCUMENT_NOT_PERCISTED = "ERROR_DOCUMENT_NOT_PERCISTED"
)

const (
	FILE      = 1
	DIRECTORY = 2
)

func IsDocumentTypeValid(documentType int) bool {

	return IsFile(documentType) || IsDirectory(documentType)

}

func IsFile(documentType int) bool {
	return FILE == documentType
}

func IsDirectory(documentType int) bool {
	return DIRECTORY == documentType
}

func NewDocument(documentName string, documentType int) (error, *Document) {

	documentTypeIsValid := IsDocumentTypeValid(documentType)

	if !documentTypeIsValid {
		return fmt.Errorf(ERROR_DOCUMENT_TYPE), nil
	}

	return nil, &Document{
		DocumentName: &documentName,
		DocumentType: documentType,
	}

}

func (d *Document) GetOriginalName() *string {

	return &d.DocumentOriginalName

}

func (d *Document) GetName() *string {

	if d.DocumentName == nil {
		return d.GetOriginalName()
	}

	return d.DocumentName

}
