-- name: CreateTag :one
INSERT INTO tags (id, tag_name, tag_type)
VALUES ($1, $2, $3)
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

-- name: AddTagToFile :exec
INSERT INTO file_tags (id, tag_id, file_id)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: RemoveTagFromFile :exec
DELETE FROM file_tags
WHERE tag_id = $1 AND file_id = $2;

-- name: GetTagsByFileID :many
SELECT t.* FROM tags t
JOIN file_tags ft ON t.id = ft.tag_id
WHERE ft.file_id = $1
ORDER BY t.tag_name ASC;

-- name: GetFilesByTagID :many
SELECT f.* FROM files f
JOIN file_tags ft ON f.id = ft.file_id
WHERE ft.tag_id = $1
ORDER BY f.created_at DESC;
