-- name: CreateOCRJob :one
INSERT INTO ocr_jobs (resource_id, file_path, status)
VALUES ($1, $2, 'pending')
RETURNING *;

-- name: GetOCRJob :one
SELECT * FROM ocr_jobs
WHERE id = $1 LIMIT 1;

-- name: ListPendingOCRJobs :many
SELECT * FROM ocr_jobs
WHERE status = 'pending'
ORDER BY created_at ASC;

-- name: UpdateOCRJobStatus :exec
UPDATE ocr_jobs
SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
WHERE id = $3;

-- name: DeleteOCRJob :exec
DELETE FROM ocr_jobs
WHERE id = $1;
