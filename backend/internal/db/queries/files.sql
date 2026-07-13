-- name: GetFile :one
SELECT * FROM files
WHERE id = $1 LIMIT 1;

-- name: ListFiles :many
SELECT * FROM files
WHERE parent_file_id IS NULL
ORDER BY created_at DESC;

-- name: ListFolders :many
SELECT * FROM files
WHERE is_folder = true
ORDER BY created_at DESC;

-- name: ListFilesByID :many
SELECT * FROM files
WHERE id = ANY($1::text[])
ORDER BY created_at DESC;

-- name: CreateFile :one
INSERT INTO files (id, name, mime_type, size, storage_key, checksum, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING *;

-- name: CreateFolder :one
INSERT INTO files (id, name, is_folder, created_at, updated_at)
VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING *;

-- name: ListFilesByParentID :many
SELECT * FROM files
WHERE parent_file_id = $1
ORDER BY is_folder DESC, created_at DESC;

-- name: UpdateFile :exec
UPDATE files
SET name = $1, mime_type = $2, ocr_text = $3, updated_at = CURRENT_TIMESTAMP
WHERE id = $4;

-- name: DeleteFile :exec
DELETE FROM files
WHERE id = $1;
