-- Partages user→user (docs/api-v1.md §6.1) : une seule ligne active par
-- (resource, grantee) — soft-revoked_at ; le déclin de l'outbox propage
-- état, pas l'inverse.
CREATE TABLE shares (
    id TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    resource_id TEXT NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
    grantee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access TEXT NOT NULL CHECK (access IN ('viewer','commenter','editor')),
    inherit BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_shares_resource ON shares(resource_id);
CREATE INDEX idx_shares_grantee ON shares(grantee_user_id) WHERE revoked_at IS NULL;
-- Une seule ligne active par paire (resource, grantee)
CREATE UNIQUE INDEX idx_shares_active ON shares(resource_id, grantee_user_id) WHERE revoked_at IS NULL;

-- Liens de partage publics : token = id (généré par le client, 32-hex).
CREATE TABLE share_links (
    id TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    resource_id TEXT NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
    access TEXT NOT NULL CHECK (access IN ('viewer','commenter','editor')),
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_share_links_token ON share_links(id) WHERE revoked_at IS NULL;
CREATE INDEX idx_share_links_resource ON share_links(resource_id);
