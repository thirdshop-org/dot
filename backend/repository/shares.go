package repository

import (
	"database/sql"
	"errors"
	"time"
)

// Access ranking — docs/api-v1.md §6.2.
const (
	AccessNone      = 0
	AccessViewer    = 1
	AccessCommenter = 2
	AccessEditor    = 3
	AccessOwner     = 4
)

// AccessFromString maps contract access levels to numeric ranks.
func AccessFromString(s string) int {
	switch s {
	case "viewer":
		return AccessViewer
	case "commenter":
		return AccessCommenter
	case "editor":
		return AccessEditor
	case "owner":
		return AccessOwner
	default:
		return AccessNone
	}
}

// AccessToString maps numeric ranks back to the contract string.
func AccessToString(rank int) string {
	switch rank {
	case AccessViewer:
		return "viewer"
	case AccessCommenter:
		return "commenter"
	case AccessEditor:
		return "editor"
	case AccessOwner:
		return "owner"
	default:
		return ""
	}
}

// EffectivePermission mirrors the full ResourcePermission DTO from
// docs/api-v1.md §6.2 — one row per resource the user can access.
type EffectivePermission struct {
	ResourceID    string
	ResourceType  string
	EffectiveRank int
	OwnerID       string
	SharedByID    *string
	ExpiresAt     *time.Time
	Inherit       bool
	UpdatedAt     time.Time
	Name          string
	ParentID      *string
}

// ResourceAccess is the result of EffectiveAccess — a lightweight check
// for whether the user can act on a given resource.
type ResourceAccess struct {
	Accessible    bool
	IsOwner       bool
	EffectiveRank int
	Inherit       bool
}

// Shares implements share persistence for user-to-user grants.
type Shares struct {
	DB *sql.DB
}

// Upsert inserts or updates an active share. On conflict (active row for
// same resource + grantee) the access, inherit, and expires_at are updated.
func (s *Shares) Upsert(resourceID, granteeUserID, access string, inherit bool, expiresAt *time.Time, createdBy string) error {
	var expires any
	if expiresAt != nil {
		expires = *expiresAt
	}
	_, err := s.DB.Exec(
		`INSERT INTO shares (id, resource_id, grantee_user_id, access, inherit, created_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (resource_id, grantee_user_id) WHERE revoked_at IS NULL
		 DO UPDATE SET access = EXCLUDED.access,
		               inherit = EXCLUDED.inherit,
		               expires_at = EXCLUDED.expires_at,
		               updated_at = NOW()`,
		NewID(), resourceID, granteeUserID, access, inherit, createdBy, expires,
	)
	return err
}

// Revoke soft-revokes the active share between a resource and a grantee.
func (s *Shares) Revoke(resourceID, granteeUserID string) error {
	result, err := s.DB.Exec(
		`UPDATE shares SET revoked_at = NOW(), updated_at = NOW()
		 WHERE resource_id = $1 AND grantee_user_id = $2 AND revoked_at IS NULL`,
		resourceID, granteeUserID,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// ListEffectivePermissions computes the full permissions snapshot for the
// calling user (docs/api-v1.md §6.2).
//
// Key invariants enforced by the CTE:
//  1. TTL (24h) is NOT applied server-side — it is a client-side cache
//     concern. The server returns ALL effective permissions; the client
//     downgrades to viewer when cachedAt > 24h.
//  2. Ownership (rank 4) always wins.
//  3. Expired grants (expires_at in the past) are excluded AND do not
//     propagate to descendants.
//  4. Revoked shares (revoked_at IS NOT NULL) are excluded AND do not
//     propagate.
//  5. Ancestors propagate ONLY when inherit = true on the ancestor grant.
//  6. The exact-node permission is authoritative (§6.2 rule 2): a resource
//     with its own owned row or direct grant keeps that rank, which is NOT
//     overridden by an ancestor grant. inherit=false on that node only stops
//     propagation to descendants.
//  7. Rules 5+6 combine: a node WITHOUT its own seed keeps the highest rank
//     among the inherit=true grants up its chain (§6.2 rule 5). inherit=false
//     on an intermediate node does NOT block a grant further up from passing
//     through it.
func (s *Shares) ListEffectivePermissions(userID string, afterMs int64) ([]EffectivePermission, error) {
	rows, err := s.DB.Query(`
WITH RECURSIVE
-- Seeds: owned (rank=4) rows + active grants to this user (rank from the access column).
-- is_seed marks these: their own rank is authoritative on the node.
seeded(id, type, updated_at, parent_id, grant_rank, created_by, expires_at, grant_inherit, name, is_seed) AS (
    SELECT r.resource_id, r.type, r.updated_at, r.parent_id,
           4::int, NULL::text, NULL::timestamptz, FALSE, r.name, TRUE
    FROM resources r
    WHERE r.user_id = $1 AND r.deleted_at IS NULL
  UNION ALL
    SELECT r.resource_id, r.type, r.updated_at, r.parent_id,
           CASE sh.access WHEN 'viewer' THEN 1 WHEN 'commenter' THEN 2 WHEN 'editor' THEN 3 ELSE 0 END,
           sh.created_by, sh.expires_at, sh.inherit, r.name, TRUE
    FROM shares sh
    JOIN resources r ON r.resource_id = sh.resource_id
    WHERE sh.grantee_user_id = $1 AND sh.revoked_at IS NULL
      AND (sh.expires_at IS NULL OR sh.expires_at > NOW())
      AND r.deleted_at IS NULL
),
-- Recursive descendants: walk DOWN from each seeded row, following children.
-- A child inherits the rank of an inherit=true grant up the chain; propagated
-- rows are NOT seeds (is_seed = FALSE). inherit=false on an intermediate node
-- does not block a grant further up from passing through it.
descendants(id, type, updated_at, parent_id, grant_rank, created_by, expires_at, grant_inherit, name, is_seed, depth) AS (
    SELECT *, 0 FROM seeded
  UNION ALL
    SELECT r.resource_id, r.type, r.updated_at, r.parent_id,
           d.grant_rank, d.created_by, d.expires_at, TRUE, r.name, FALSE, d.depth + 1
    FROM resources r
    JOIN descendants d ON r.parent_id = d.id
    WHERE d.grant_inherit AND d.grant_rank BETWEEN 1 AND 3
      AND r.deleted_at IS NULL
      AND d.depth < 100
)
SELECT d.id, d.type,
       (EXTRACT(EPOCH FROM d.updated_at) * 1000)::bigint AS updated_at_ms,
       COALESCE(r.user_id, d.effective_created_by) AS owner_id,
       d.effective_rank, d.effective_created_by,
       d.effective_expires_at, d.effective_inherit,
       d.name, r.parent_id
FROM (
    SELECT id, type, updated_at, parent_id, name,
           -- The node's own seed rank wins when it IS a seed (owned/direct
           -- grant, §6.2 rule 2); otherwise the highest inherited rank wins
           -- (rule 5). The winning row also supplies created_by / expires_at /
           -- inherit.
           (ARRAY_AGG(grant_rank ORDER BY is_seed DESC, grant_rank DESC))[1] AS effective_rank,
           (ARRAY_AGG(created_by ORDER BY is_seed DESC, grant_rank DESC))[1] AS effective_created_by,
           (ARRAY_AGG(expires_at ORDER BY is_seed DESC, grant_rank DESC))[1] AS effective_expires_at,
           (ARRAY_AGG(grant_inherit ORDER BY is_seed DESC, grant_rank DESC))[1] AS effective_inherit
    FROM descendants
    WHERE grant_rank > 0
    GROUP BY id, type, updated_at, parent_id, name
) d
LEFT JOIN resources r ON r.resource_id = d.id
WHERE (EXTRACT(EPOCH FROM r.updated_at) * 1000)::bigint > $2
   OR r.updated_at IS NULL
ORDER BY d.updated_at DESC
LIMIT 10000`,
		userID, afterMs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []EffectivePermission
	for rows.Next() {
		var (
			p           EffectivePermission
			updatedAtMs int64
			ownerID     sql.NullString
			createdBy   sql.NullString
			expiresAt   sql.NullTime
			parentID    sql.NullString
		)
		if err := rows.Scan(
			&p.ResourceID, &p.ResourceType, &updatedAtMs,
			&ownerID, &p.EffectiveRank, &createdBy,
			&expiresAt, &p.Inherit,
			&p.Name, &parentID,
		); err != nil {
			return nil, err
		}
		p.UpdatedAt = time.UnixMilli(updatedAtMs)
		if ownerID.Valid {
			p.OwnerID = ownerID.String
		} else {
			p.OwnerID = userID
		}
		if createdBy.Valid {
			p.SharedByID = &createdBy.String
		}
		if expiresAt.Valid {
			p.ExpiresAt = &expiresAt.Time
		}
		if parentID.Valid {
			p.ParentID = &parentID.String
		}
		perms = append(perms, p)
	}
	return perms, rows.Err()
}

// EffectiveAccess computes the effective access rank of a user on a specific
// resource, walking ancestors for inherited grants. This is the server-side
// enforcement for individual resource access (e.g. GET /files/:id).
//
// It mirrors the snapshot semantics (§6.2): ownership → owner (rule 4); else
// the exact-node permission is authoritative (rule 2); else the highest rank
// among the inherit=true grants up the ancestor chain wins (rules 3 + 5).
func (s *Shares) EffectiveAccess(userID, resourceID string) (ResourceAccess, error) {
	var ra ResourceAccess
	err := s.DB.QueryRow(`
WITH RECURSIVE
-- 1. Ownership beats everything.
owned AS (
    SELECT 4::int AS rank
    FROM resources WHERE resource_id = $2 AND user_id = $1 AND deleted_at IS NULL
),
-- 2. Direct grants on this exact node (apply regardless of inherit, rule 2).
direct AS (
    SELECT CASE sh.access WHEN 'viewer' THEN 1 WHEN 'commenter' THEN 2 WHEN 'editor' THEN 3 ELSE 0 END AS rank
    FROM shares sh
    JOIN resources r ON r.resource_id = sh.resource_id
    WHERE sh.resource_id = $2 AND sh.grantee_user_id = $1
      AND sh.revoked_at IS NULL
      AND (sh.expires_at IS NULL OR sh.expires_at > NOW())
      AND r.deleted_at IS NULL
),
-- 3. Walk UP the ancestors starting at the node's parent. Any ancestor with an
--    active grant AND inherit = true contributes its rank (rule 3); the whole
--    chain is considered and the highest wins (rule 5). inherit=false on an
--    intermediate node does not block a grant further up.
inherited(id, grant_rank, depth) AS (
    SELECT r.parent_id,
           COALESCE((SELECT CASE sh.access WHEN 'viewer' THEN 1 WHEN 'commenter' THEN 2 WHEN 'editor' THEN 3 ELSE 0 END
                     FROM shares sh
                     WHERE sh.resource_id = r.parent_id AND sh.grantee_user_id = $1
                       AND sh.revoked_at IS NULL AND sh.inherit
                       AND (sh.expires_at IS NULL OR sh.expires_at > NOW())), 0),
           0
    FROM resources r
    WHERE r.resource_id = $2 AND r.deleted_at IS NULL AND r.parent_id IS NOT NULL
  UNION ALL
    SELECT r.parent_id,
           COALESCE((SELECT CASE sh.access WHEN 'viewer' THEN 1 WHEN 'commenter' THEN 2 WHEN 'editor' THEN 3 ELSE 0 END
                     FROM shares sh
                     WHERE sh.resource_id = ag.id AND sh.grantee_user_id = $1
                       AND sh.revoked_at IS NULL AND sh.inherit
                       AND (sh.expires_at IS NULL OR sh.expires_at > NOW())), 0),
           ag.depth + 1
    FROM inherited ag
    JOIN resources r ON r.resource_id = ag.id
    WHERE r.deleted_at IS NULL AND ag.depth < 100
)
SELECT EXISTS(SELECT 1 FROM owned)
    OR EXISTS(SELECT 1 FROM direct WHERE rank > 0)
    OR EXISTS(SELECT 1 FROM inherited WHERE grant_rank > 0),
       CASE
         WHEN EXISTS(SELECT 1 FROM owned) THEN 4
         WHEN (SELECT COALESCE(MAX(rank), 0) FROM direct) > 0 THEN (SELECT MAX(rank) FROM direct)
         ELSE COALESCE((SELECT MAX(grant_rank) FROM inherited), 0)
       END,
       EXISTS(SELECT 1 FROM owned)`,
		userID, resourceID,
	).Scan(&ra.Accessible, &ra.EffectiveRank, &ra.IsOwner)
	if err != nil {
		return ra, err
	}
	return ra, nil
}

// ResourceExists confirms a non-deleted resource exists in the system
// (ownership not checked — used for share operations where the caller
// must own the resource, verified separately).
func (s *Shares) ResourceExists(resourceID string) (bool, error) {
	var exists int
	err := s.DB.QueryRow(
		`SELECT 1 FROM resources WHERE resource_id = $1 AND deleted_at IS NULL`,
		resourceID,
	).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// CreateLink stores a share link (token = id, client-generated 32-hex).
func (s *Shares) CreateLink(token, resourceID, access string, expiresAt *time.Time, createdBy string) error {
	var expires any
	if expiresAt != nil {
		expires = *expiresAt
	}
	_, err := s.DB.Exec(
		`INSERT INTO share_links (id, resource_id, access, created_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		token, resourceID, access, createdBy, expires,
	)
	return err
}

// RevokeLink soft-revokes a link by token. Returns ErrNotFound if the link
// does not exist or is already revoked.
func (s *Shares) RevokeLink(token string) error {
	result, err := s.DB.Exec(
		`UPDATE share_links SET revoked_at = NOW()
		 WHERE id = $1 AND revoked_at IS NULL`,
		token,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// LinkInfo is the public-facing shape for GET /shares/links/:token.
type LinkInfo struct {
	Token        string     `json:"token"`
	ResourceID   string     `json:"resource_id"`
	ResourceType string     `json:"resourceType"`
	Name         string     `json:"name"`
	Access       string     `json:"access"`
	ExpiresAt    *time.Time `json:"expiresAt"`
}

// GetPublicLink resolves a link token to resource metadata. Returns
// ErrNotFound if the link is revoked, expired, or unknown.
func (s *Shares) GetPublicLink(token string) (LinkInfo, error) {
	var info LinkInfo
	var expiresAt sql.NullTime
	err := s.DB.QueryRow(
		`SELECT sl.id, sl.resource_id, r.type, r.name, sl.access, sl.expires_at
		 FROM share_links sl
		 JOIN resources r ON r.resource_id = sl.resource_id
		 WHERE sl.id = $1 AND sl.revoked_at IS NULL
		   AND (sl.expires_at IS NULL OR sl.expires_at > NOW())
		   AND r.deleted_at IS NULL`,
		token,
	).Scan(&info.Token, &info.ResourceID, &info.ResourceType, &info.Name, &info.Access, &expiresAt)
	if err == sql.ErrNoRows {
		return LinkInfo{}, ErrNotFound
	}
	if err != nil {
		return LinkInfo{}, err
	}
	if expiresAt.Valid {
		info.ExpiresAt = &expiresAt.Time
	}
	return info, nil
}

// ListActiveLinksForResource returns all non-revoked links for a given resource.
func (s *Shares) ListActiveLinksForResource(resourceID string) ([]LinkInfo, error) {
	rows, err := s.DB.Query(
		`SELECT sl.id, sl.resource_id, r.type, r.name, sl.access, sl.expires_at
		 FROM share_links sl
		 JOIN resources r ON r.resource_id = sl.resource_id
		 WHERE sl.resource_id = $1 AND sl.revoked_at IS NULL
		 ORDER BY sl.created_at DESC`,
		resourceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var links []LinkInfo
	for rows.Next() {
		var (
			info      LinkInfo
			expiresAt sql.NullTime
		)
		if err := rows.Scan(&info.Token, &info.ResourceID, &info.ResourceType, &info.Name, &info.Access, &expiresAt); err != nil {
			return nil, err
		}
		if expiresAt.Valid {
			info.ExpiresAt = &expiresAt.Time
		}
		links = append(links, info)
	}
	return links, rows.Err()
}

// Errors specific to shares.
var ErrGranteeNotFound = errors.New("grantee user not found")
