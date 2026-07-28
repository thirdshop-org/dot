-- name: CreateSyncQueueItem :one
INSERT INTO sync_queue (resource_id, storage_location_id, operation, status, attempts)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetSyncQueueItem :one
SELECT * FROM sync_queue
WHERE id = $1;

-- name: ListPendingSyncItems :many
SELECT * FROM sync_queue
WHERE status = 'pending'
ORDER BY created_at ASC;

-- name: ListPendingSyncItemsByLocation :many
SELECT * FROM sync_queue
WHERE storage_location_id = $1 AND status = 'pending'
ORDER BY created_at ASC;

-- name: UpdateSyncQueueStatus :exec
UPDATE sync_queue
SET status = $1, attempts = $2, updated_at = CURRENT_TIMESTAMP
WHERE id = $3;

-- name: DeleteSyncQueueItem :exec
DELETE FROM sync_queue
WHERE id = $1;
