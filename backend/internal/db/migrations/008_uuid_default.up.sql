ALTER TABLE files ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE files ALTER COLUMN storage_key SET DEFAULT '';
