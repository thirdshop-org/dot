CREATE TABLE resources (
    resource_id TEXT PRIMARY KEY CHECK (resource_id ~ '^[0-9a-f]{32}$'),
    type TEXT NOT NULL CHECK (type IN ('file', 'folder')),
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES resources(resource_id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    content_hash VARCHAR(128),
    size_bytes BIGINT DEFAULT 0,
    mime_type VARCHAR(255),
    extension VARCHAR(64),
    category VARCHAR(50) CHECK (category IN ('photo', 'video', 'document', 'audio', 'other')),
    taken_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT resources_unique_name_per_parent UNIQUE (parent_id, name)
);

CREATE INDEX idx_resources_owner ON resources(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_resources_parent ON resources(parent_id);
CREATE INDEX idx_resources_category ON resources(category) WHERE deleted_at IS NULL;

-- Unicité du nom à la racine (NULL ≠ NULL : la contrainte (parent_id,name)
-- ne couvre pas parent_id NULL).
CREATE UNIQUE INDEX idx_resources_root_name ON resources(owner_id, name) WHERE parent_id IS NULL;