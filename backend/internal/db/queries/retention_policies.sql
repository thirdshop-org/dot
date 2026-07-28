-- name: CreateRetentionPolicy :one
INSERT INTO retention_policies (user_id, storage_location_id, rule_type, rule_value)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetRetentionPolicy :one
SELECT * FROM retention_policies
WHERE id = $1;

-- name: ListRetentionPoliciesByUser :many
SELECT * FROM retention_policies
WHERE user_id = $1;

-- name: ListRetentionPoliciesByLocation :many
SELECT * FROM retention_policies
WHERE storage_location_id = $1;

-- name: DeleteRetentionPolicy :exec
DELETE FROM retention_policies
WHERE id = $1;
