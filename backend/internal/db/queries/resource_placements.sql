-- name: CreatePlacement :one
INSERT INTO resource_placements (resource_id, storage_location_id, status, storage_key, synced_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetPlacement :one
SELECT * FROM resource_placements
WHERE resource_id = $1 AND storage_location_id = $2
LIMIT 1;

-- name: ListPlacementsByResource :many
SELECT * FROM resource_placements
WHERE resource_id = $1;

-- name: ListPlacementsByLocation :many
SELECT * FROM resource_placements
WHERE storage_location_id = $1;

-- name: UpdatePlacementStatus :exec
UPDATE resource_placements
SET status = $1, synced_at = CURRENT_TIMESTAMP
WHERE id = $2;

-- name: DeletePlacement :exec
DELETE FROM resource_placements
WHERE id = $1;

-- name: GetServerPlacementByResource :one
SELECT rp.* FROM resource_placements rp
JOIN storage_locations sl ON sl.id = rp.storage_location_id
WHERE rp.resource_id = $1 AND sl.role = 'server'
LIMIT 1;
