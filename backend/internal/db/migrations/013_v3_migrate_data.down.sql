-- VaultDrop 013 down: revert data migration
-- Re-add tag_type to tags
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tag_type TEXT NOT NULL DEFAULT 'none';

DROP TABLE IF EXISTS resource_tags;

DELETE FROM resource_variants;

DELETE FROM rebac_relations;

DELETE FROM resource_placements;

DELETE FROM storage_locations;

DELETE FROM resources;
