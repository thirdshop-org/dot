-- VaultDrop 012: V3 new tables - resources, storage_locations, resource_placements, etc.

-- Add parent_user_id to users for groups/organizations
ALTER TABLE users ADD COLUMN parent_user_id UUID REFERENCES users(id);

-- Resources (replaces files)
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    size BIGINT NOT NULL DEFAULT 0,
    checksum TEXT NOT NULL DEFAULT '',
    ocr_text TEXT NOT NULL DEFAULT '',
    is_folder BOOLEAN NOT NULL DEFAULT false,
    parent_resource_id UUID REFERENCES resources(id),
    owner_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_resources_owner ON resources(owner_id);
CREATE INDEX idx_resources_parent ON resources(parent_resource_id);
CREATE INDEX idx_resources_checksum_owner ON resources(checksum, owner_id);

-- Resource variants (replaces thumbnails)
CREATE TABLE resource_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    variant_type TEXT NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    generated_by TEXT NOT NULL DEFAULT 'server' CHECK (generated_by IN ('server', 'client')),
    storage_key TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_variants_resource ON resource_variants(resource_id);
CREATE UNIQUE INDEX idx_variants_resource_type_page ON resource_variants(resource_id, variant_type, page_number);

-- Storage locations (devices, server, backup)
CREATE TABLE storage_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    device_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary', 'device', 'backup', 'server')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP
);

CREATE INDEX idx_locations_user ON storage_locations(user_id);

-- Resource placements (pivot resource × storage_location)
CREATE TABLE resource_placements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    storage_location_id UUID NOT NULL REFERENCES storage_locations(id),
    status TEXT NOT NULL DEFAULT 'synced' CHECK (status IN ('local_only', 'synced', 'cloud_only', 'pending_upload', 'pending_download')),
    storage_key TEXT,
    synced_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_id, storage_location_id)
);

CREATE INDEX idx_placements_resource ON resource_placements(resource_id);
CREATE INDEX idx_placements_location ON resource_placements(storage_location_id);
CREATE INDEX idx_placements_status ON resource_placements(status);

-- Retention policies
CREATE TABLE retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    storage_location_id UUID NOT NULL REFERENCES storage_locations(id),
    rule_type TEXT NOT NULL,
    rule_value JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policies_user ON retention_policies(user_id);
CREATE INDEX idx_policies_location ON retention_policies(storage_location_id);

-- Sync queue
CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    storage_location_id UUID NOT NULL REFERENCES storage_locations(id),
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queue_status ON sync_queue(status);
CREATE INDEX idx_queue_resource ON sync_queue(resource_id);
CREATE INDEX idx_queue_location ON sync_queue(storage_location_id);

-- ReBAC relations
CREATE TABLE rebac_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    subject_user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    granted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_id, subject_user_id)
);

CREATE INDEX idx_rebac_resource ON rebac_relations(resource_id);
CREATE INDEX idx_rebac_subject ON rebac_relations(subject_user_id);

-- Function to resolve effective role with recursive parent/group traversal
CREATE OR REPLACE FUNCTION resolve_effective_role(p_user_id UUID, p_resource_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    WITH RECURSIVE rtree AS (
        SELECT r.id, r.parent_resource_id, r.owner_id
        FROM resources r
        WHERE r.id = p_resource_id
        UNION ALL
        SELECT r.id, r.parent_resource_id, r.owner_id
        FROM resources r
        JOIN rtree ON r.id = rtree.parent_resource_id
    )
    SELECT CASE
        WHEN EXISTS(SELECT 1 FROM rtree WHERE owner_id = p_user_id) THEN 'owner'
        ELSE COALESCE(
            (SELECT rr.role::text FROM rebac_relations rr
             JOIN rtree ON rr.resource_id = rtree.id
             WHERE rr.subject_user_id = p_user_id
             ORDER BY CASE rr.role
                WHEN 'owner' THEN 0
                WHEN 'admin' THEN 1
                WHEN 'editor' THEN 2
                WHEN 'viewer' THEN 3
             END ASC LIMIT 1),
            ''
        )
    END INTO v_role;
    RETURN v_role;
END;
$$ LANGUAGE plpgsql;
