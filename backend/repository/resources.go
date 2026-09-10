package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
)

// ErrNotFound is returned when a row is absent (or not owned by the scoping device).
var ErrNotFound = errors.New("resource not found")

// ErrNameConflict is returned when a sibling with the same name already exists.
var ErrNameConflict = errors.New("name conflict")

// NewID returns an opaque lowercase 32-hex identifier (charset ^[0-9a-f]{32}$),
// mirroring the mobile's lower(hex(randomblob(16))). Never a UUID.
func NewID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	return hex.EncodeToString(buf)
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}

type FileRow struct {
	ID        string
	Name      string
	Size      int64
	MimeType  string
	FolderID  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type FolderRow struct {
	ID       string
	Name     string
	ParentID string
}

// Resources implements resource persistence, always scoped by owner device.
type Resources struct {
	DB *sql.DB
}

// sortColumns maps contract `sort` values to safe SQL columns.
var sortColumns = map[string]string{
	"size":       "size_bytes",
	"created_at": "created_at",
	"updated_at": "updated_at",
	"added_at":   "created_at",
}

func sortClause(sort, order string) (string, string) {
	column, ok := sortColumns[sort]
	if !ok {
		column = "created_at"
	}
	direction := "DESC"
	if order == "asc" {
		direction = "ASC"
	}
	return column, direction
}

func (r *Resources) folderExists(ownerID, folderID string) (bool, error) {
	var exists int
	err := r.DB.QueryRow(
		`SELECT 1 FROM resources
		 WHERE resource_id = $1 AND owner_id = $2 AND type = 'folder' AND deleted_at IS NULL`,
		folderID, ownerID,
	).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (r *Resources) insert(ownerID, id, name, parentResourceID, resourceType string, size int64, mimeType, extension *string) error {
	if parentResourceID != "" {
		ok, err := r.folderExists(ownerID, parentResourceID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("folder %s: %w", parentResourceID, ErrNotFound)
		}
	}
	var parentID any
	if parentResourceID != "" {
		parentID = parentResourceID
	}
	_, err := r.DB.Exec(
		`INSERT INTO resources (resource_id, type, name, parent_id, owner_id, size_bytes, mime_type, extension)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, resourceType, name, parentID, ownerID, size, mimeType, extension,
	)
	if isUniqueViolation(err) {
		return ErrNameConflict
	}
	return err
}

// InsertFile persists a file metadata row for the owner device. The parent
// folder (when non-empty) must belong to the same device.
func (r *Resources) InsertFile(ownerID, id, name, folderResourceID string, size int64, mimeType, extension *string) error {
	return r.insert(ownerID, id, name, folderResourceID, "file", size, mimeType, extension)
}

// InsertFolder persists a folder metadata row.
func (r *Resources) InsertFolder(ownerID, id, name, parentResourceID string) error {
	return r.insert(ownerID, id, name, parentResourceID, "folder", 0, nil, nil)
}

const fileColumns = `resource_id, name, size_bytes, COALESCE(mime_type, ''), COALESCE(parent_id, ''), created_at, updated_at`

func (r *Resources) scanFile(scan func(...any) error) (FileRow, error) {
	var row FileRow
	err := scan(&row.ID, &row.Name, &row.Size, &row.MimeType, &row.FolderID, &row.CreatedAt, &row.UpdatedAt)
	return row, err
}

// ListFiles returns the owner device's files (optionally within a folder),
// plus the total count matching the filter.
func (r *Resources) ListFiles(ownerID, folderResourceID string, limit, offset int, sort, order string) ([]FileRow, int, error) {
	column, direction := sortClause(sort, order)
	var folderFilter any
	if folderResourceID != "" {
		folderFilter = folderResourceID
	}
	where := `type = 'file' AND deleted_at IS NULL AND owner_id = $1 AND ($2::text IS NULL OR parent_id = $2)`

	var total int
	if err := r.DB.QueryRow(`SELECT COUNT(*) FROM resources WHERE `+where, ownerID, folderFilter).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.DB.Query(
		fmt.Sprintf(`SELECT %s FROM resources WHERE %s ORDER BY %s %s LIMIT $3 OFFSET $4`,
			fileColumns, where, column, direction),
		ownerID, folderFilter, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	files := make([]FileRow, 0)
	for rows.Next() {
		row, err := r.scanFile(rows.Scan)
		if err != nil {
			return nil, 0, err
		}
		files = append(files, row)
	}
	return files, total, rows.Err()
}

func (r *Resources) GetFile(ownerID, resourceID string) (FileRow, error) {
	row := r.DB.QueryRow(
		`SELECT `+fileColumns+` FROM resources
		 WHERE type = 'file' AND deleted_at IS NULL AND owner_id = $1 AND resource_id = $2`,
		ownerID, resourceID,
	)
	file, err := r.scanFile(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return FileRow{}, ErrNotFound
	}
	return file, err
}

// DeleteFile soft-deletes the file (deleted_at), returning its id.
func (r *Resources) DeleteFile(ownerID, resourceID string) (string, error) {
	result, err := r.DB.Exec(
		`UPDATE resources SET deleted_at = NOW(), updated_at = NOW()
		 WHERE type = 'file' AND deleted_at IS NULL AND owner_id = $1 AND resource_id = $2`,
		ownerID, resourceID,
	)
	if err != nil {
		return "", err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return "", err
	}
	if affected == 0 {
		return "", ErrNotFound
	}
	return resourceID, nil
}

// ListRootFolders returns the owner device's top-level folders (parent_id NULL).
func (r *Resources) ListRootFolders(ownerID string) ([]FolderRow, error) {
	rows, err := r.DB.Query(
		`SELECT resource_id, name, COALESCE(parent_id, '') FROM resources
		 WHERE type = 'folder' AND parent_id IS NULL AND deleted_at IS NULL AND owner_id = $1
		 ORDER BY name ASC`,
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	folders := make([]FolderRow, 0)
	for rows.Next() {
		var folder FolderRow
		if err := rows.Scan(&folder.ID, &folder.Name, &folder.ParentID); err != nil {
			return nil, err
		}
		folders = append(folders, folder)
	}
	return folders, rows.Err()
}
