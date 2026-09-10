DROP INDEX IF EXISTS idx_users_username_normalized;

ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS username_normalized;
ALTER TABLE users DROP COLUMN IF EXISTS username;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;