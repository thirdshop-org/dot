package handlers

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
)

// retourne qui est delete qui est updated et created
func (h *Handlers) SyncFiles(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Sync not yet implemented",
		},
	})
}

func (h *Handlers) ListFiles(c *gin.Context) {

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

func (h *Handlers) ListFile(c *gin.Context) {

	id := c.Param("id")

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

	file := Finfo{}

	for _, dir := range dirs {

		if dir.IsDir() {
			continue
		}

		i, e := dir.Info()

		if e != nil {
			continue
		}

		if id != i.Name() {
			continue
		}

		ps := Finfo{
			Url:  service.GenerateFileDownloadUrl(i.Name()),
			Name: i.Name(),
			Size: i.Size(),
			Tags: []string{},
		}

		file = ps

		break

	}

	c.JSON(http.StatusOK, gin.H{
		"data": file,
		"meta": gin.H{
			"total": 1,
		},
	})
}

func (h *Handlers) GetFile(c *gin.Context) {

	exp, _ := strconv.ParseInt(c.Query("expires"), 10, 64)

	r := service.Validate(c.Params.ByName("id"), c.Query("sig"), exp)

	if r != true {

		c.JSON(http.StatusForbidden, gin.H{
			"error": gin.H{
				"code":    "FILE_NOT_FOUND",
				"message": "File not found",
			},
		})

		return

	}

	c.File(path.Join("./uploads/", c.Params.ByName("id")))

}

func (h *Handlers) UploadFile(c *gin.Context) {

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

	err = c.SaveUploadedFile(file, dst)

	if err != nil {

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "ERROR",
				"message": "Uploaded",
			},
		})

		return

	}

	fileByte, err := os.ReadFile(dst)

	if err != nil {

		// fmt.Println("error reading file")

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "ERROR",
				"message": "Error reading file",
			},
		})

		return

	}

	checksum := service.CreateSHA256Hash(fileByte)
	// TODO: re-enable once files table + query are added
	// createFileParams := db.CreateFileParams{
	// 	Name:       file.Filename,
	// 	StorageKey: dst,
	// 	Checksum:   string(checksum[:]),
	// }
	// dbFile, err := h.queries.CreateFile(ctx, createFileParams)
	_ = checksum

	c.JSON(http.StatusOK, gin.H{
		"error": gin.H{
			"code":    "SUCCESS",
			"message": "Uploaded",
		},
	})

}

func (h *Handlers) DeleteFile(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Delete not yet implemented",
		},
	})
}

func (h *Handlers) SearchFiles(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": []interface{}{},
		"meta": gin.H{
			"page":  1,
			"total": 0,
		},
	})
}

func (h *Handlers) AddTags(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"code":    "NOT_IMPLEMENTED",
			"message": "Add tags not yet implemented",
		},
	})
}

func (h *Handlers) GetTags(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"data": []interface{}{},
	})
}
