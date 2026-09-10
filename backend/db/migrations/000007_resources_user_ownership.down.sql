-- Reverse de 000007. Réversible SEULEMENT sur base vide (les ressources sont
-- détruites dans les deux sens : sans device associé, il n'y a rien à
-- préserver).
DELETE FROM resources;

ALTER TABLE resources DROP CONSTRAINT resources_user_id_fkey;
ALTER TABLE resources RENAME COLUMN user_id TO owner_id;
ALTER TABLE resources ADD CONSTRAINT resources_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES devices(device_id) ON DELETE CASCADE;