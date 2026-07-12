-- name: GetFile :one
SELECT * FROM files
WHERE id = ? LIMIT 1;

-- name: ListFiles :many
SELECT * FROM files
ORDER BY name;

-- name: CreateFile :one
INSERT INTO files (
  name,storage_key,checksum,created_at,updated_at,deleted_at
) VALUES (
  ?, ?, ?,date(),date(),date()
)
RETURNING *;