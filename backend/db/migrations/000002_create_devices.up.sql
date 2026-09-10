CREATE TABLE devices (
    device_id TEXT PRIMARY KEY CHECK (device_id ~ '^[0-9a-f]{32}$'),
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ
);

CREATE INDEX idx_devices_user ON devices(user_id) WHERE user_id IS NOT NULL;