-- name: CreateResourceVariant :one
INSERT INTO resource_variants (resource_id, variant_type, page_number, width, height, mime_type, generated_by, storage_key)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetVariantsByResourceID :many
SELECT * FROM resource_variants
WHERE resource_id = $1
ORDER BY page_number ASC, variant_type ASC;

-- name: GetVariantByID :one
SELECT * FROM resource_variants
WHERE id = $1 LIMIT 1;

-- name: DeleteVariantsByResourceID :exec
DELETE FROM resource_variants WHERE resource_id = $1;

-- name: GetBestVariant :one
SELECT * FROM resource_variants
WHERE resource_id = $1 AND variant_type = $2 AND page_number = 1
LIMIT 1;
