CREATE TABLE ocr_jobs (
    job_id TEXT PRIMARY KEY CHECK (job_id ~ '^[0-9a-f]{32}$'),
    file_id TEXT NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
    language VARCHAR(64) DEFAULT 'fra+eng',
    text TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ocr_jobs_status ON ocr_jobs(status);
CREATE INDEX idx_ocr_jobs_file ON ocr_jobs(file_id);