-- name: CreateThumbnail :one
INSERT INTO thumbnails (file_id, page_number, resolution_label, width, height, storage_key, mime_type)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetThumbnailsByFileID :many
SELECT * FROM thumbnails
WHERE file_id = $1
ORDER BY page_number ASC, resolution_label ASC;

-- name: GetThumbnailByID :one
SELECT * FROM thumbnails
WHERE id = $1 LIMIT 1;

-- name: DeleteThumbnailsByFileID :exec
DELETE FROM thumbnails WHERE file_id = $1;

-- name: GetThumbnailByFilePageResolution :one
SELECT * FROM thumbnails
WHERE file_id = $1 AND page_number = $2 AND resolution_label = $3
LIMIT 1;
