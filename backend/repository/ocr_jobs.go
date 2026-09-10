package repository

import (
	"database/sql"
	"errors"
)

// OcrJobRow maps ocr_jobs.
type OcrJobRow struct {
	ID       string
	FileID   string
	DeviceID string
	Status   string
	Text     *string
	Error    *string
}

// ErrJobNotFound marks an OCR job absent or owned by another device.
var ErrJobNotFound = errors.New("ocr job not found")

type OcrJobs struct{ DB *sql.DB }

func (o *OcrJobs) Create(jobID, deviceID, fileID string) error {
	_, err := o.DB.Exec(
		`INSERT INTO ocr_jobs (job_id, device_id, file_id) VALUES ($1, $2, $3)`,
		jobID, deviceID, fileID,
	)
	return err
}

// Get returns a job scoped by device (no-rows → ErrJobNotFound).
func (o *OcrJobs) Get(deviceID, jobID string) (OcrJobRow, error) {
	var row OcrJobRow
	var text, errMsg sql.NullString
	err := o.DB.QueryRow(
		`SELECT job_id, file_id, device_id, status,
		        NULLIF(text, ''), NULLIF(error, '')
		 FROM ocr_jobs WHERE job_id = $1 AND device_id = $2`,
		jobID, deviceID,
	).Scan(&row.ID, &row.FileID, &row.DeviceID, &row.Status, &text, &errMsg)
	if err == sql.ErrNoRows {
		return OcrJobRow{}, ErrJobNotFound
	}
	if err != nil {
		return OcrJobRow{}, err
	}
	if text.Valid {
		row.Text = &text.String
	}
	if errMsg.Valid {
		row.Error = &errMsg.String
	}
	return row, nil
}

func (o *OcrJobs) TouchProcessing(deviceID, jobID string) error {
	_, err := o.DB.Exec(
		`UPDATE ocr_jobs SET status = 'processing', started_at = NOW()
		 WHERE job_id = $1 AND device_id = $2 AND status = 'queued'`,
		jobID, deviceID,
	)
	return err
}

func (o *OcrJobs) Complete(deviceID, jobID, text string) error {
	_, err := o.DB.Exec(
		`UPDATE ocr_jobs SET status = 'done', text = NULLIF($3, ''), started_at = COALESCE(started_at, NOW()), completed_at = NOW()
		 WHERE job_id = $1 AND device_id = $2`,
		jobID, deviceID, text,
	)
	return err
}

func (o *OcrJobs) Fail(deviceID, jobID, message string) error {
	_, err := o.DB.Exec(
		`UPDATE ocr_jobs SET status = 'failed', error = NULLIF($3, ''), started_at = COALESCE(started_at, NOW()), completed_at = NOW()
		 WHERE job_id = $1 AND device_id = $2`,
		jobID, deviceID, message,
	)
	return err
}
