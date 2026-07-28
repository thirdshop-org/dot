-- name: CreateRebacRelation :one
INSERT INTO rebac_relations (resource_id, subject_user_id, role, granted_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetRebacRelation :one
SELECT * FROM rebac_relations
WHERE resource_id = $1 AND subject_user_id = $2
LIMIT 1;

-- name: ListRebacRelationsByResource :many
SELECT * FROM rebac_relations
WHERE resource_id = $1
ORDER BY created_at ASC;

-- name: ListRebacRelationsBySubject :many
SELECT * FROM rebac_relations
WHERE subject_user_id = $1
ORDER BY created_at ASC;

-- name: DeleteRebacRelation :exec
DELETE FROM rebac_relations
WHERE resource_id = $1 AND subject_user_id = $2;

-- name: DeleteRebacRelationsByResource :exec
DELETE FROM rebac_relations
WHERE resource_id = $1;

-- name: HasRebacRelation :one
SELECT EXISTS(
    SELECT 1 FROM rebac_relations
    WHERE resource_id = $1 AND subject_user_id = $2 AND role = $3
);

-- name: ResolveEffectiveRole :one
SELECT resolve_effective_role($1, $2) AS role;
