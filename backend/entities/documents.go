package entities

import (
	"fmt"
)

type Document struct {
	UUID         *string
	Type         int
	Name         *string
	OriginalName string
	Version      int
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

func NewDocument(documentName string, documentType int, documentVersion int) (error, *Document) {

	documentTypeIsValid := IsDocumentTypeValid(documentType)

	if !documentTypeIsValid {
		return fmt.Errorf(ERROR_DOCUMENT_TYPE), nil
	}

	return nil, &Document{
		Name:    &documentName,
		Type:    documentType,
		Version: documentVersion,
	}

}

func (d *Document) GetOriginalName() *string {

	return &d.OriginalName

}

func (d *Document) GetName() *string {

	if d.Name == nil {
		return d.GetOriginalName()
	}

	return d.Name

}
