-- VaultDrop 003: tags table

CREATE TABLE tags (
  id          TEXT PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  parent_tag_id TEXT,  
  tag_name    TEXT NOT NULL, -- exemple: Brice, vélo, facture ...
  tag_type    TEXT NOT NULL DEFAULT 'none', -- exemple: entity, none
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_parent_tag FOREIGN KEY(parent_tag_id) REFERENCES tags(id)
);

CREATE TABLE file_tags (
  id TEXT PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  tag_id TEXT,
  file_id TEXT,
  CONSTRAINT fk_tag FOREIGN KEY(tag_id) REFERENCES tags(id),
  CONSTRAINT fk_file FOREIGN KEY(file_id) REFERENCES files(id)
)
