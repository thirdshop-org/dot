package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func ListFiles(c *gin.Context) {

	dirs, err := os.ReadDir("./uploads/")

	if err != nil {

		fmt.Println("What")
		c.JSON(http.StatusInternalServerError, gin.H{
			"data": []interface{}{},
			"meta": gin.H{
				"page":  1,
				"total": 0,
			},
		})

		return
	}

	type Finfo struct {
		Name string   `json:"name"`
		Size int64    `json:"size"`
		Tags []string `json:"tags"`
	}

	files := []Finfo{}

	for _, dir := range dirs {

		if dir.IsDir() {
			continue
		}

		i, e := dir.Info()

		if e != nil {
			continue
		}

		ps := Finfo{
			Name: i.Name(),
			Size: i.Size(),
			Tags: []string{},
		}

		files = append(files, ps)

	}

	c.JSON(http.StatusOK, gin.H{
		"data": files,
		"meta": gin.H{
			"page":  1,
			"total": 0,
		},
	})
}

func GetFile(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{
		"error": gin.H{
			"code":    "FILE_NOT_FOUND",
			"message": "File not found",
		},
	})
}

func UploadFile(c *gin.Context) {

	file, err := c.FormFile("file")

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"code":    "NOT_FOUND",
				"message": "form file with file name missing",
			},
		})
	}

	dst := filepath.Join("./uploads/", filepath.Base(file.Filename))

	c.SaveUploadedFile(file, dst)

	c.String(http.StatusOK, fmt.Sprintf("'%s' uploaded!", file.Filename))

	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Upload not yet implemented",
		},
	})
}

func DeleteFile(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Delete not yet implemented",
		},
	})
}

func SearchFiles(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": []interface{}{},
		"meta": gin.H{
			"page":  1,
			"total": 0,
		},
	})
}

func AddTags(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Add tags not yet implemented",
		},
	})
}

func GetTags(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": []interface{}{},
	})
}
