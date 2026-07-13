ALTER TABLE files ADD COLUMN parent_file_id TEXT;

ALTER TABLE files ADD CONSTRAINT fk_parent_file_id FOREIGN KEY(parent_file_id) REFERENCES files(id)