-- Bascule ownership device → user (étapes 6-10 de la tranche identité).
-- Destructif ASSUMÉ : à ce stade aucune release V1, la base de dev est RESET
-- (DELETE trivial sur une table vide ; PAS de user marqueur). Le modele
-- resources reste parfaitement identique par ailleurs.
DELETE FROM resources;

ALTER TABLE resources DROP CONSTRAINT resources_owner_id_fkey;
ALTER TABLE resources RENAME COLUMN owner_id TO user_id;
ALTER TABLE resources ADD CONSTRAINT resources_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Les index créés en 000003 (idx_resources_owner, idx_resources_root_name
-- sur owner_id) suivent le renommage Intrinsèquement : ils portent désormais
-- sur user_id. L'unicité racine devient donc « 1 nom par USER » (multi-device
-- possible pour le même compte).