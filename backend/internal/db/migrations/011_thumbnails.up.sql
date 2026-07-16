CREATE TABLE thumbnails (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id          TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    page_number      INTEGER NOT NULL,
    resolution_label TEXT NOT NULL,
    width            INTEGER NOT NULL,
    height           INTEGER NOT NULL,
    storage_key      TEXT NOT NULL,
    mime_type        TEXT NOT NULL DEFAULT 'image/jpeg',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_thumbnails_file_id ON thumbnails(file_id);
CREATE UNIQUE INDEX idx_thumbnails_unique ON thumbnails(file_id, page_number, resolution_label);
