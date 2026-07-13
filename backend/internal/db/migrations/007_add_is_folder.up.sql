-- VaultDrop 007: re-add is_folder to distinguish folders from files
ALTER TABLE files ADD COLUMN is_folder BOOLEAN NOT NULL DEFAULT false;
