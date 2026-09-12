package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
)

// operationIDPattern — operation_id outbox = TEXT 32-hex (cf. docs/api-v1.md §6.1).
var operationIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// Operations persists the per-device outbox trace enforcing idempotence
// UNIQUE(device_id, operation_id) — cf. docs/api-v1.md §6.1.
type Operations struct {
	DB *sql.DB
}

// ErrInvalidOperationID is returned when operation_id is not 32 lowercase hex.
var ErrInvalidOperationID = errors.New("operation_id must be 32 lowercase hex chars")

// Applied reports whether the operation was already processed for this device.
func (o *Operations) Applied(deviceID, operationID string) (bool, error) {
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
func (o *Operations) Record(deviceID, operationID string, opType, refType string, refID *int64, resourceID string, payload []byte) error {
	if !operationIDPattern.MatchString(operationID) {
		return ErrInvalidOperationID
	}
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
