-- VaultDrop 013: Migrate data from V1 to V3
-- Assigns all existing files to user 'pixel'

-- 1. Ensure user 'pixel' exists (create if not)
INSERT INTO users (username, password_hash)
SELECT 'pixel', '$argon2id$v=19$m=65536,t=1,p=4$placeholder$placeholder'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'pixel');

-- 2. Migrate files -> resources
INSERT INTO resources (id, name, mime_type, size, checksum, ocr_text, is_folder, parent_resource_id, owner_id, created_at, updated_at)
SELECT
    f.id::uuid,
    f.name,
    f.mime_type,
    f.size,
    f.checksum,
    f.ocr_text,
    f.is_folder,
    f.parent_file_id::uuid,
    (SELECT id FROM users WHERE username = 'pixel'),
    f.created_at,
    f.updated_at
FROM files f
ON CONFLICT (id) DO NOTHING;

-- 3. Create server storage_location for user 'pixel'
INSERT INTO storage_locations (id, user_id, device_name, role)
SELECT
    gen_random_uuid(),
    (SELECT id FROM users WHERE username = 'pixel'),
    'VaultDrop Server',
    'server'
WHERE NOT EXISTS (
    SELECT 1 FROM storage_locations
    WHERE user_id = (SELECT id FROM users WHERE username = 'pixel')
    AND role = 'server'
);

-- 4. Create resource_placements for migrated resources
INSERT INTO resource_placements (resource_id, storage_location_id, status, storage_key, synced_at)
SELECT
    r.id,
    sl.id,
    'synced',
    f.storage_key,
    CURRENT_TIMESTAMP
FROM resources r
JOIN files f ON f.id::uuid = r.id
CROSS JOIN storage_locations sl
WHERE sl.user_id = (SELECT id FROM users WHERE username = 'pixel')
AND sl.role = 'server'
ON CONFLICT (resource_id, storage_location_id) DO NOTHING;

-- 5. Create rebac_relations (owner) for all migrated resources
INSERT INTO rebac_relations (resource_id, subject_user_id, role, granted_by)
SELECT
    r.id,
    u.id,
    'owner',
    u.id
FROM resources r
CROSS JOIN (SELECT id FROM users WHERE username = 'pixel') u
ON CONFLICT (resource_id, subject_user_id) DO NOTHING;

-- 6. Migrate thumbnails -> resource_variants
INSERT INTO resource_variants (id, resource_id, variant_type, page_number, width, height, mime_type, generated_by, storage_key, created_at)
SELECT
    t.id::uuid,
    t.file_id::uuid,
    CASE
        WHEN t.resolution_label = 'thumbnail' THEN 'thumbnail_small'
        WHEN t.resolution_label = 'full' THEN 'thumbnail_full'
        ELSE t.resolution_label
    END,
    t.page_number,
    t.width,
    t.height,
    t.mime_type,
    'server',
    t.storage_key,
    t.created_at
FROM thumbnails t
ON CONFLICT (id) DO NOTHING;

-- 7. Create resource_tags from file_tags (keep old file_tags for now)
CREATE TABLE IF NOT EXISTS resource_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id TEXT,
    resource_id TEXT
);

INSERT INTO resource_tags (id, tag_id, resource_id)
SELECT
    gen_random_uuid(),
    ft.tag_id,
    ft.file_id
FROM file_tags ft;

-- 8. Remove tag_type column from tags
ALTER TABLE tags DROP COLUMN IF EXISTS tag_type;
