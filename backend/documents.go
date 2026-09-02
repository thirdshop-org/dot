package main

import "fmt"

type Document struct {
	DocumentName string
	DocumentType int
}

const (
	ERROR_DOCUMENT_TYPE = "ERROR_DOCUMENT_TYPE"
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
		DocumentName: documentName,
		DocumentType: documentType,
	}

}
