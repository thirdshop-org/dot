-- Identité utilisateur (tranche users + auth).
-- users.id reste TEXT 32-hex (convention du contrat V1, docs/api-v1.md §2).
-- L'unicité porte sur username_normalized (lowercase), jamais sur username
-- (forme affichée).
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_normalized TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- email redevient optionnel SANS unicité en V1 : le destinataire d'un partage
-- se résout par username, jamais par email.
DROP INDEX IF EXISTS idx_users_email;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_normalized
  ON users(username_normalized) WHERE username_normalized IS NOT NULL;

-- devices.user_id est INFORMATIF uniquement (« dernier utilisateur connu ») :
-- il n'autorise RIEN. L'autorisation ne passe que par le claim user_id du
-- token paseto, résolu par le middleware RequireDevice.