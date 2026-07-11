package service

import (
	"fmt"
	"mime/multipart"
)

func UploadFile(f *multipart.FileHeader) {
	fmt.Println(f.Filename)
}
