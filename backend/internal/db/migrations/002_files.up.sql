-- VaultDrop 002: Files table
CREATE TABLE files (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT '',
  size        BIGINT NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  checksum    TEXT NOT NULL DEFAULT '',
  ocr_text    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
