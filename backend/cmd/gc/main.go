package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/vaultdrop/backend/internal/config"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	uploadDir := cfg.UploadDir
	thumbnailDir := cfg.ThumbnailDir

	fmt.Println("=== VaultDrop Orphan GC ===")
	fmt.Printf("Upload dir: %s\n", uploadDir)
	fmt.Printf("Thumbnail dir: %s\n", thumbnailDir)

	var fileCount int
	err = db.QueryRow("SELECT COUNT(*) FROM files WHERE is_folder = false AND storage_key != ''").Scan(&fileCount)
	if err != nil {
		log.Fatalf("Failed to count files: %v", err)
	}
	fmt.Printf("Files in DB: %d\n", fileCount)

	rows, err := db.Query("SELECT id, storage_key FROM files WHERE is_folder = false AND storage_key != ''")
	if err != nil {
		log.Fatalf("Failed to query files: %v", err)
	}
	defer rows.Close()

	dbPaths := make(map[string]string)
	for rows.Next() {
		var id, storageKey string
		if err := rows.Scan(&id, &storageKey); err != nil {
			continue
		}
		dbPaths[storageKey] = id
	}

	entries, err := os.ReadDir(uploadDir)
	if err != nil {
		log.Fatalf("Failed to read upload dir: %v", err)
	}

	orphanFiles := 0
	freedBytes := int64(0)
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		fullPath := filepath.Join(uploadDir, entry.Name())
		relPath := "./" + fullPath

		if _, ok := dbPaths[fullPath]; !ok {
			if _, ok2 := dbPaths[relPath]; !ok2 {
				info, err := entry.Info()
				if err == nil {
					freedBytes += info.Size()
				}
				orphanFiles++
				fmt.Printf("  ORPHAN FILE: %s\n", fullPath)
				os.Remove(fullPath)
			}
		}
	}

	var thumbCount int
	err = db.QueryRow("SELECT COUNT(*) FROM thumbnails").Scan(&thumbCount)
	if err != nil {
		log.Fatalf("Failed to count thumbnails: %v", err)
	}
	fmt.Printf("Thumbnails in DB: %d\n", thumbCount)

	thumbRows, err := db.Query("SELECT id, file_id, storage_key FROM thumbnails")
	if err != nil {
		log.Fatalf("Failed to query thumbnails: %v", err)
	}
	defer thumbRows.Close()

	dbThumbPaths := make(map[string]string)
	for thumbRows.Next() {
		var id, fileID, storageKey string
		if err := thumbRows.Scan(&id, &fileID, &storageKey); err != nil {
			continue
		}
		dbThumbPaths[storageKey] = fileID
	}

	if _, err := os.Stat(thumbnailDir); err == nil {
		fileDirs, err := os.ReadDir(thumbnailDir)
		if err == nil {
			for _, fileDir := range fileDirs {
				if !fileDir.IsDir() {
					continue
				}
				fileDirPath := filepath.Join(thumbnailDir, fileDir.Name())
				thumbFiles, err := os.ReadDir(fileDirPath)
				if err != nil {
					continue
				}
				for _, tf := range thumbFiles {
					if tf.IsDir() || strings.HasPrefix(tf.Name(), ".") {
						continue
					}
					thumbPath := filepath.Join(fileDirPath, tf.Name())
					relThumbPath := "./" + thumbPath
					if _, ok := dbThumbPaths[thumbPath]; !ok {
						if _, ok2 := dbThumbPaths[relThumbPath]; !ok2 {
							info, err := tf.Info()
							if err == nil {
								freedBytes += info.Size()
							}
							orphanFiles++
							fmt.Printf("  ORPHAN THUMB: %s\n", thumbPath)
							os.Remove(thumbPath)
						}
					}
				}

				remaining, _ := os.ReadDir(fileDirPath)
				if len(remaining) == 0 {
					os.Remove(fileDirPath)
				}
			}
		}
	}

	fmt.Printf("\n=== Summary ===\n")
	fmt.Printf("Orphan files removed: %d\n", orphanFiles)
	fmt.Printf("Space freed: %.2f MB\n", float64(freedBytes)/(1024*1024))
}
