-- name: CreateTag :one
INSERT INTO tags (tag_name)
VALUES ($1)
RETURNING *;

-- name: GetTag :one
SELECT * FROM tags
WHERE id = $1;

-- name: GetTagByName :one
SELECT * FROM tags
WHERE tag_name = $1;

-- name: ListTags :many
SELECT * FROM tags
ORDER BY tag_name ASC;

-- name: DeleteTag :exec
DELETE FROM tags
WHERE id = $1;

-- name: AddTagToResource :exec
INSERT INTO resource_tags (tag_id, resource_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveTagFromResource :exec
DELETE FROM resource_tags
WHERE tag_id = $1 AND resource_id = $2;

-- name: GetTagsByResourceID :many
SELECT t.* FROM tags t
JOIN resource_tags rt ON t.id = rt.tag_id
WHERE rt.resource_id = $1
ORDER BY t.tag_name ASC;

-- name: GetResourcesByTagID :many
SELECT r.* FROM resources r
JOIN resource_tags rt ON r.id = rt.resource_id
WHERE rt.tag_id = $1
ORDER BY r.created_at DESC;
