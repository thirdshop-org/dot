-- VaultDrop 014 down: restore legacy tables

CREATE TABLE files (
    id TEXT PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    size BIGINT NOT NULL DEFAULT 0,
    storage_key TEXT NOT NULL DEFAULT '',
    checksum TEXT NOT NULL DEFAULT '',
    ocr_text TEXT NOT NULL DEFAULT '',
    is_folder BOOLEAN NOT NULL DEFAULT false,
    parent_file_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE thumbnails (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    resolution_label TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE file_tags (
    id TEXT PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    tag_id TEXT,
    file_id TEXT
);
