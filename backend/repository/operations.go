package repository

import (
	"database/sql"
	"encoding/json"
)

// Operations persists the per-device outbox trace enforcing idempotence
// UNIQUE(device_id, operation_id) — cf. docs/api-v1.md §6.1.
type Operations struct {
	DB *sql.DB
}

// Applied reports whether the operation was already processed for this device.
func (o *Operations) Applied(deviceID string, operationID int64) (bool, error) {
	var exists int
	err := o.DB.QueryRow(
		`SELECT 1 FROM operations WHERE device_id = $1 AND operation_id = $2`,
		deviceID, operationID,
	).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// Record stores an applied operation trace (idempotent on replay).
func (o *Operations) Record(deviceID string, operationID int64, opType, refType string, refID *int64, resourceID string, payload []byte) error {
	var refTypeValue any
	if refType != "" {
		refTypeValue = refType
	}
	_, err := o.DB.Exec(
		`INSERT INTO operations (device_id, operation_id, op_type, ref_type, ref_id, resource_id, payload)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (device_id, operation_id) DO NOTHING`,
		deviceID, operationID, opType, refTypeValue, refID, nullable(resourceID), jsonBytes(payload),
	)
	return err
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func jsonBytes(payload []byte) any {
	if len(payload) == 0 || string(payload) == "null" {
		return []byte(`{}`)
	}
	if !json.Valid(payload) {
		return []byte(`{}`)
	}
	return payload
}
