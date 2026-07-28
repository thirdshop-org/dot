-- VaultDrop 012 down: drop V3 new tables
DROP FUNCTION IF EXISTS resolve_effective_role;
DROP TABLE IF EXISTS rebac_relations;
DROP TABLE IF EXISTS sync_queue;
DROP TABLE IF EXISTS retention_policies;
DROP TABLE IF EXISTS resource_placements;
DROP TABLE IF EXISTS storage_locations;
DROP TABLE IF EXISTS resource_variants;
DROP TABLE IF EXISTS resources;
ALTER TABLE users DROP COLUMN IF EXISTS parent_user_id;
