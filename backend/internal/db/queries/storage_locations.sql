-- name: CreateStorageLocation :one
INSERT INTO storage_locations (user_id, device_name, role)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetStorageLocation :one
SELECT * FROM storage_locations
WHERE id = $1;

-- name: ListStorageLocationsByUser :many
SELECT * FROM storage_locations
WHERE user_id = $1
ORDER BY created_at ASC;

-- name: GetServerStorageLocation :one
SELECT * FROM storage_locations
WHERE user_id = $1 AND role = 'server'
LIMIT 1;

-- name: UpdateStorageLocationLastSeen :exec
UPDATE storage_locations
SET last_seen_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: DeleteStorageLocation :exec
DELETE FROM storage_locations
WHERE id = $1;
