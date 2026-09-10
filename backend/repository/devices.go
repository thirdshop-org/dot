package repository

import (
	"database/sql"
)

// Devices persists registered devices (idempotence outbox par device, dernier
// user_id informatif).
type Devices struct {
	DB *sql.DB
}

// Upsert registers the device if absent and refreshes last_seen_at.
func (d *Devices) Upsert(deviceID string) error {
	_, err := d.DB.Exec(
		`INSERT INTO devices (device_id, registered_at, last_seen_at)
		 VALUES ($1, NOW(), NOW())
		 ON CONFLICT (device_id) DO UPDATE SET last_seen_at = NOW()`,
		deviceID,
	)
	return err
}

// Exists reports whether a device has been registered.
func (d *Devices) Exists(deviceID string) (bool, error) {
	var exists int
	err := d.DB.QueryRow(`SELECT 1 FROM devices WHERE device_id = $1`, deviceID).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// MarkUser mémorise le dernier utilisateur connecté sur ce device (INFORMATIF,
// jamais autorisant) et rafraîchit last_seen_at. Appelé au login.
func (d *Devices) MarkUser(deviceID, userID string) error {
	_, err := d.DB.Exec(
		`UPDATE devices SET user_id = $2, last_seen_at = NOW() WHERE device_id = $1`,
		deviceID, userID,
	)
	return err
}
