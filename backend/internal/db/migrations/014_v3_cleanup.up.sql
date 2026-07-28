-- VaultDrop 014: Drop legacy V1 tables

-- Tags now use resource_tags instead of file_tags
DROP TABLE IF EXISTS file_tags;

-- Thumbnails migrated to resource_variants
DROP TABLE IF EXISTS thumbnails;

-- Files migrated to resources
DROP TABLE IF EXISTS files;
