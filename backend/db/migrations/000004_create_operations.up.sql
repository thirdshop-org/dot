CREATE TABLE operations (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL CHECK (operation_id ~ '^[0-9a-f]{32}$'),
    op_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'failed')),
    error_code TEXT,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT operations_unique_per_device UNIQUE (device_id, operation_id)
);

CREATE INDEX idx_operations_device_created ON operations(device_id, created_at);