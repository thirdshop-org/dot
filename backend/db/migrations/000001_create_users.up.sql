CREATE TABLE users (
    id TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    email VARCHAR(255),
    display_name VARCHAR(255),
    parent_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    storage_quota_bytes BIGINT DEFAULT 10737418240,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_users_parent ON users(parent_user_id) WHERE deleted_at IS NULL;