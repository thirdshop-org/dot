-- name: GetFile :one
SELECT * FROM files
WHERE id = ? LIMIT 1;

-- name: ListFiles :many
SELECT * FROM files
ORDER BY created_at DESC;

-- name: ListFilesByID :many
SELECT * FROM files
WHERE id IN (SELECT value FROM json_each(?))
ORDER BY created_at DESC;

-- name: CreateFile :one
INSERT INTO files (id, name, mime_type, size, storage_key, checksum, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING *;

-- name: UpdateFile :exec
UPDATE files
SET name = ?, mime_type = ?, ocr_text = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- name: DeleteFile :exec
DELETE FROM files
WHERE id = ?;

-- name: UpdateNLPData :exec
UPDATE files
SET nlp_data = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?;
