CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_locations_user_server
ON storage_locations(user_id) WHERE role = 'server';
