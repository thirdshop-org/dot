package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
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

// grantedCTE expands, for the user bound to $1, the set of accessible
// resource ids — owned rows (each its own seed) + active direct grants +
// every node reached by an inherit=true grant up its chain (passing through
// intermediate nodes, per docs/api-v1.md §6.2 rule 5). Only the visibility
// SET matters here (which resources the user can read, viewer+); the effective
// rank is validated by repository.Shares.EffectiveAccess. Walk bounded at
// depth < 100. Append a query that references
// `resource_id IN (SELECT id FROM granted)`.
const grantedCTE = `
	seeded(id, type, rank, inherit, depth) AS (
		SELECT r.resource_id, r.type, 4::int, FALSE, 0
		FROM resources r
		WHERE r.user_id = $1 AND r.deleted_at IS NULL
	  UNION ALL
		SELECT r.resource_id, r.type,
		       CASE sh.access WHEN 'viewer' THEN 1 WHEN 'commenter' THEN 2 WHEN 'editor' THEN 3 ELSE 0 END,
		       sh.inherit, 0
		FROM shares sh
		JOIN resources r ON r.resource_id = sh.resource_id
		WHERE sh.grantee_user_id = $1 AND sh.revoked_at IS NULL
		  AND (sh.expires_at IS NULL OR sh.expires_at > NOW())
		  AND r.deleted_at IS NULL
	),
	granted(id, rank, inherit, depth) AS (
		SELECT id, rank, inherit, 0 FROM seeded
	  UNION ALL
		SELECT r.resource_id, g.rank, TRUE, g.depth + 1
		FROM resources r
		JOIN granted g ON r.parent_id = g.id
		WHERE g.inherit AND g.rank BETWEEN 1 AND 3
		  AND r.deleted_at IS NULL AND g.depth < 100
	)`

func (r *Resources) folderExists(ownerID, folderID string) (bool, error) {
	var exists int
	err := r.DB.QueryRow(
		`SELECT 1 FROM resources
		 WHERE resource_id = $1 AND user_id = $2 AND type = 'folder' AND deleted_at IS NULL`,
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
		`INSERT INTO resources (resource_id, type, name, parent_id, user_id, size_bytes, mime_type, extension)
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

// ListFiles returns the owner device's files (within a folder, or at the
// root when folderResourceID is empty), plus the total count.
func (r *Resources) ListFiles(ownerID, folderResourceID string, limit, offset int, sort, order string) ([]FileRow, int, error) {
	column, direction := sortClause(sort, order)
	where := `type = 'file' AND deleted_at IS NULL AND user_id = $1 AND ($2::text = '' AND parent_id IS NULL OR parent_id = $2)`

	var total int
	if err := r.DB.QueryRow(`SELECT COUNT(*) FROM resources WHERE `+where, ownerID, folderResourceID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.DB.Query(
		fmt.Sprintf(`SELECT %s FROM resources WHERE %s ORDER BY %s %s LIMIT $3 OFFSET $4`,
			fileColumns, where, column, direction),
		ownerID, folderResourceID, limit, offset,
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

// ListFilesVisible returns the user's accessible files (owned or shared,
// viewer+) within a folder (or at the root when folderResourceID is empty).
func (r *Resources) ListFilesVisible(userID, folderResourceID string, limit, offset int, sort, order string) ([]FileRow, int, error) {
	column, direction := sortClause(sort, order)
	where := `type = 'file' AND deleted_at IS NULL AND resource_id IN (SELECT id FROM granted)
	          AND ($2::text = '' AND parent_id IS NULL OR parent_id = $2)`

	var total int
	if err := r.DB.QueryRow(`WITH RECURSIVE `+grantedCTE+` SELECT COUNT(*) FROM resources WHERE `+where, userID, folderResourceID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.DB.Query(
		fmt.Sprintf(`WITH RECURSIVE %s SELECT %s FROM resources WHERE %s ORDER BY %s %s LIMIT $3 OFFSET $4`,
			grantedCTE, fileColumns, where, column, direction),
		userID, folderResourceID, limit, offset,
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

// GetFile returns a file owned by the device (no-rows → ErrNotFound).
func (r *Resources) GetFile(ownerID, resourceID string) (FileRow, error) {
	row := r.DB.QueryRow(
		`SELECT `+fileColumns+` FROM resources
		 WHERE type = 'file' AND deleted_at IS NULL AND user_id = $1 AND resource_id = $2`,
		ownerID, resourceID,
	)
	file, err := r.scanFile(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return FileRow{}, ErrNotFound
	}
	return file, err
}

// GetFileVisible returns a file the user can access (owned or shared, viewer+).
func (r *Resources) GetFileVisible(userID, resourceID string) (FileRow, error) {
	row := r.DB.QueryRow(`WITH RECURSIVE `+grantedCTE+`
		SELECT `+fileColumns+` FROM resources
		WHERE type = 'file' AND deleted_at IS NULL AND resource_id = $2
		  AND resource_id IN (SELECT id FROM granted)`,
		userID, resourceID,
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
		 WHERE type = 'file' AND deleted_at IS NULL AND user_id = $1 AND resource_id = $2`,
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

// SearchFiles returns the owner device's files whose name matches q
// (case-insensitive substring, wildcards escaped), plus the total count.
func (r *Resources) SearchFiles(ownerID, q string, limit, offset int) ([]FileRow, int, error) {
	pattern := `%` + escapeLike(q) + `%`
	where := `type = 'file' AND deleted_at IS NULL AND user_id = $1 AND name ILIKE $2 ESCAPE '\'`

	var total int
	if err := r.DB.QueryRow(`SELECT COUNT(*) FROM resources WHERE `+where, ownerID, pattern).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.DB.Query(
		fmt.Sprintf(`SELECT %s FROM resources WHERE %s ORDER BY name ASC LIMIT $3 OFFSET $4`,
			fileColumns, where),
		ownerID, pattern, limit, offset,
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

// SearchFilesVisible returns the user's accessible files (owned or shared,
// viewer+) whose name matches q (case-insensitive substring).
func (r *Resources) SearchFilesVisible(userID, q string, limit, offset int) ([]FileRow, int, error) {
	pattern := `%` + escapeLike(q) + `%`
	where := `type = 'file' AND deleted_at IS NULL AND resource_id IN (SELECT id FROM granted) AND name ILIKE $2 ESCAPE '\'`

	var total int
	if err := r.DB.QueryRow(`WITH RECURSIVE `+grantedCTE+` SELECT COUNT(*) FROM resources WHERE `+where, userID, pattern).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.DB.Query(
		fmt.Sprintf(`WITH RECURSIVE %s SELECT %s FROM resources WHERE %s ORDER BY name ASC LIMIT $3 OFFSET $4`,
			grantedCTE, fileColumns, where),
		userID, pattern, limit, offset,
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

func escapeLike(q string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(q)
}

// GetFolder returns a folder row owned by the device (no-rows → ErrNotFound).
func (r *Resources) GetFolder(ownerID, resourceID string) (FolderRow, error) {
	var row FolderRow
	err := r.DB.QueryRow(
		`SELECT resource_id, name, COALESCE(parent_id, '') FROM resources
		 WHERE type = 'folder' AND deleted_at IS NULL AND user_id = $1 AND resource_id = $2`,
		ownerID, resourceID,
	).Scan(&row.ID, &row.Name, &row.ParentID)
	if err == sql.ErrNoRows {
		return FolderRow{}, ErrNotFound
	}
	return row, err
}

// MoveResource sets parent_id (root when parentResourceID empty). The target
// folder must exist and belong to the owner. Absent source is a no-op.
func (r *Resources) MoveResource(ownerID, resourceID, parentResourceID string) error {
	if parentResourceID != "" {
		if _, err := r.GetFolder(ownerID, parentResourceID); err != nil {
			return err
		}
	}
	var parentID any
	if parentResourceID != "" {
		parentID = parentResourceID
	}
	result, err := r.DB.Exec(
		`UPDATE resources SET parent_id = $3, updated_at = NOW()
		 WHERE resource_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		resourceID, ownerID, parentID,
	)
	if err != nil && isUniqueViolation(err) {
		return ErrNameConflict
	}
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateName renames a resource. Absent source is a no-op.
func (r *Resources) UpdateName(ownerID, resourceID, name string) error {
	result, err := r.DB.Exec(
		`UPDATE resources SET name = $3, updated_at = NOW()
		 WHERE resource_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		resourceID, ownerID, name,
	)
	if err != nil && isUniqueViolation(err) {
		return ErrNameConflict
	}
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateNameByID renames a resource without owner scoping — the caller
// (service) has already verified the user's effective access (editor+).
func (r *Resources) UpdateNameByID(resourceID, name string) error {
	result, err := r.DB.Exec(
		`UPDATE resources SET name = $2, updated_at = NOW()
		 WHERE resource_id = $1 AND deleted_at IS NULL`,
		resourceID, name,
	)
	if err != nil && isUniqueViolation(err) {
		return ErrNameConflict
	}
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// SyncDelete soft-deletes a resource; absence is NOT an error (idempotent
// terminal state for the outbox).
func (r *Resources) SyncDelete(ownerID, resourceID string) error {
	_, err := r.DB.Exec(
		`UPDATE resources SET deleted_at = NOW(), updated_at = NOW()
		 WHERE resource_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		resourceID, ownerID,
	)
	return err
}

// ExistsOwner reports whether a non-deleted resource belongs to the device.
func (r *Resources) ExistsOwner(ownerID, resourceID string) (bool, error) {
	var exists int
	err := r.DB.QueryRow(
		`SELECT 1 FROM resources WHERE resource_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		resourceID, ownerID,
	).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// TouchResource bumps updated_at on a non-deleted resource so that the
// grantee's delta snapshot picks it up after a share is created.
func (r *Resources) TouchResource(resourceID string) error {
	_, err := r.DB.Exec(
		`UPDATE resources SET updated_at = NOW() WHERE resource_id = $1 AND deleted_at IS NULL`,
		resourceID,
	)
	return err
}

// OwnedRow is a snapshot row: resource identity + freshness.
type OwnedRow struct {
	ID        string
	Type      string
	UpdatedAt time.Time
}

// ListOwned returns the device's non-deleted resources whose updated_at
// (in epoch ms) is strictly greater than afterMs (0 = all).
func (r *Resources) ListOwned(ownerID string, afterMs int64) ([]OwnedRow, error) {
	rows, err := r.DB.Query(
		`SELECT resource_id, type, updated_at FROM resources
		 WHERE user_id = $1 AND deleted_at IS NULL
		   AND (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint > $2
		 ORDER BY updated_at DESC
		 LIMIT 10000`,
		ownerID, afterMs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]OwnedRow, 0)
	for rows.Next() {
		var row OwnedRow
		if err := rows.Scan(&row.ID, &row.Type, &row.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// ListRootFolders returns the owner device's top-level folders (parent_id NULL).
func (r *Resources) ListRootFolders(ownerID string) ([]FolderRow, error) {
	rows, err := r.DB.Query(
		`SELECT resource_id, name, COALESCE(parent_id, '') FROM resources
		 WHERE type = 'folder' AND parent_id IS NULL AND deleted_at IS NULL AND user_id = $1
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

// ListRootFoldersVisible returns the user's accessible top-level folders —
// owned (rank 4) or shared (viewer+) at the root.
func (r *Resources) ListRootFoldersVisible(userID string) ([]FolderRow, error) {
	rows, err := r.DB.Query(`WITH RECURSIVE `+grantedCTE+`
		SELECT resource_id, name, COALESCE(parent_id, '') FROM resources
		WHERE type = 'folder' AND parent_id IS NULL AND deleted_at IS NULL
		  AND resource_id IN (SELECT id FROM granted)
		ORDER BY name ASC`,
		userID,
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
