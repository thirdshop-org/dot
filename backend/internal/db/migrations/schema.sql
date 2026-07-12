CREATE TABLE files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE file_tags (
  file_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (file_id, tag_id)
);
