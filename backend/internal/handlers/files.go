package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
)

func ListFiles(c *gin.Context) {

	dirs, err := os.ReadDir("./uploads/")

	if err != nil {

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
		Url  string   `json:"url"`
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
			Url:  service.GenerateFileDownloadUrl(i.Name()),
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

	exp, _ := strconv.ParseInt(c.Query("expires"), 10, 64)

	r := service.Validate(c.Params.ByName("id"), c.Query("sig"), exp)

	if r != true {

		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"code":    "FILE_NOT_FOUND",
				"message": "File not found",
			},
		})

		return

	}

	c.File(path.Join("./uploads/", c.Params.ByName("id")))

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
