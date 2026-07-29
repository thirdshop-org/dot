-- name: GetResource :one
SELECT * FROM resources
WHERE id = $1 LIMIT 1;

-- name: ListResources :many
SELECT * FROM resources
WHERE parent_resource_id IS NULL
ORDER BY is_folder DESC, created_at DESC;

-- name: ListFolders :many
SELECT * FROM resources
WHERE is_folder = true
ORDER BY created_at DESC;

-- name: ListResourcesByID :many
SELECT * FROM resources
WHERE id = ANY($1::uuid[])
ORDER BY created_at DESC;

-- name: CreateResource :one
INSERT INTO resources (name, mime_type, size, checksum, owner_id, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING *;

-- name: CreateFolder :one
INSERT INTO resources (name, is_folder, owner_id, parent_resource_id, created_at, updated_at)
VALUES ($1, true, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING *;

-- name: ListResourcesByParentID :many
SELECT * FROM resources
WHERE parent_resource_id = $1
ORDER BY is_folder DESC, created_at DESC;

-- name: MoveResources :exec
UPDATE resources
SET parent_resource_id = $1, updated_at = CURRENT_TIMESTAMP
WHERE id = ANY($2::uuid[]);

-- name: UpdateResource :exec
UPDATE resources
SET name = $1, mime_type = $2, ocr_text = $3, updated_at = CURRENT_TIMESTAMP
WHERE id = $4;

-- name: DeleteResource :exec
DELETE FROM resources
WHERE id = $1;

-- name: FindDuplicatesByNameSize :many
SELECT id, name, mime_type, size, checksum, created_at FROM resources
WHERE name = $1 AND size = $2 AND is_folder = false
ORDER BY created_at DESC;

-- name: FindDuplicateByChecksum :one
SELECT * FROM resources
WHERE checksum = $1 AND is_folder = false AND owner_id = $2
LIMIT 1;

-- name: CountResourcesByOwner :one
SELECT COUNT(*) FROM resources
WHERE owner_id = $1 AND parent_resource_id IS NULL;

-- name: ListResourcesByOwner :many
SELECT * FROM resources
WHERE owner_id = $1 AND parent_resource_id IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountResourcesByParentAndOwner :one
SELECT COUNT(*) FROM resources
WHERE parent_resource_id = $1 AND owner_id = $2;

-- name: ListResourcesByParentAndOwner :many
SELECT * FROM resources
WHERE parent_resource_id = $1 AND owner_id = $2
ORDER BY is_folder DESC, created_at DESC
LIMIT $3 OFFSET $4;
