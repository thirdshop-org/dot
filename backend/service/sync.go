package service

import (
	"encoding/json"
	"errors"
	"regexp"
	"time"

	"github.com/vaultdrop/backend/repository"
)

var resourceIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// Ops de l'outbox (docs/api-v1.md §6.1). Les ops partage (share/share_link)
// sont accusées réception mais sans état serveur en V1 (single-owner).
const (
	OpCreateResource = "create_resource"
	OpUpdateMetadata = "update_metadata"
	OpDeleteResource = "delete_resource"
	OpMoveResource   = "move_resource"
	OpShare          = "share"
	OpRevokeShare    = "revoke_share"
	OpUpdateShare    = "update_share"
	OpCreateLink     = "create_link"
	OpRevokeLink     = "revoke_link"
)

var ackOnlyOps = map[string]bool{
	OpShare: true, OpRevokeShare: true, OpUpdateShare: true,
	OpCreateLink: true, OpRevokeLink: true,
}

// SyncOperation is one outbox entry (shadow of mobile PendingOperationRow).
type SyncOperation struct {
	OperationID  string          `json:"operation_id"`
	RefType      string          `json:"ref_type"`
	RefID        int64           `json:"ref_id"`
	ResourceID   string          `json:"resource_id"`
	ResourceType string          `json:"resource_type"`
	Operation    string          `json:"operation"`
	Payload      json.RawMessage `json:"payload"`
}

// FailedOperation reports the first non-idempotent failure.
type FailedOperation struct {
	OperationID string `json:"operation_id"`
	Code        string `json:"code"`
	Message     string `json:"message"`
}

// SyncResult is the outbox response: applied = index of the next op to send.
type SyncResult struct {
	Applied int              `json:"applied"`
	Failed  *FailedOperation `json:"failed,omitempty"`
}

type createResourcePayload struct {
	Name             string `json:"name"`
	ParentResourceID string `json:"parentResourceId"` // dossier parent (racine si vide), cf. docs/api-v1.md §6.1
	MimeType         string `json:"mimeType"`
	Extension        string `json:"extension"`
}

type renamePayload struct {
	Name string `json:"name"`
}

type movePayload struct {
	ToFolderResourceID string `json:"toFolderResourceId"`
}

func classifySyncError(err error) (string, string) {
	switch {
	case errors.Is(err, repository.ErrNameConflict):
		return "NAME_CONFLICT", "a resource with this name already exists here"
	case errors.Is(err, repository.ErrNotFound):
		return "NOT_FOUND", "target resource or folder not found"
	default:
		return "INVALID_REQUEST", err.Error()
	}
}

// ApplyBatch applique les ops de l'outbox : les mutations de ressources sont
// scopées par l'UTILISATEUR (userID), l'idempotence reste par DEVICE
// (deviceID) — cf. docs/api-v1.md §6.1.
func (s *Resources) ApplyBatch(userID, deviceID string, ops []SyncOperation) (SyncResult, error) {
	for i := range ops {
		op := &ops[i]
		if err := validateSyncOp(op); err != nil {
			return SyncResult{Applied: i, Failed: &FailedOperation{OperationID: op.OperationID, Code: "INVALID_REQUEST", Message: err.Error()}}, nil
		}
		already, err := s.Repository.Operations.Applied(deviceID, op.OperationID)
		if err != nil {
			return SyncResult{}, err
		}
		if already {
			continue
		}
		if ackOnlyOps[op.Operation] {
			if err := s.recordApplied(deviceID, op); err != nil {
				return SyncResult{}, err
			}
			continue
		}
		if err := s.applySyncOp(userID, op); err != nil {
			code, message := classifySyncError(err)
			return SyncResult{Applied: i, Failed: &FailedOperation{OperationID: op.OperationID, Code: code, Message: message}}, nil
		}
		if err := s.recordApplied(deviceID, op); err != nil {
			return SyncResult{}, err
		}
	}
	return SyncResult{Applied: len(ops)}, nil
}

func validateSyncOp(op *SyncOperation) error {
	if !resourceIDPattern.MatchString(op.OperationID) {
		return errors.New("operation_id must be 32 lowercase hex chars")
	}
	if op.Operation == "" {
		return errors.New("missing operation type")
	}
	if ackOnlyOps[op.Operation] {
		return nil
	}
	if !resourceIDPattern.MatchString(op.ResourceID) {
		return errors.New("resource_id must be 32 lowercase hex chars")
	}
	switch op.Operation {
	case OpCreateResource, OpUpdateMetadata, OpMoveResource, OpDeleteResource:
	default:
		return errors.New("unknown operation " + op.Operation)
	}
	if op.ResourceType != "folder" && op.ResourceType != "file" {
		return errors.New("resource_type must be 'folder' or 'file'")
	}
	return nil
}

func (s *Resources) applySyncOp(ownerID string, op *SyncOperation) error {
	switch op.Operation {
	case OpCreateResource:
		exists, err := s.Repo.ExistsOwner(ownerID, op.ResourceID)
		if err != nil {
			return err
		}
		if exists {
			return nil
		}
		var p createResourcePayload
		if err := json.Unmarshal(op.Payload, &p); err != nil {
			return errors.New("invalid payload: " + err.Error())
		}
		if p.Name == "" {
			return errors.New("payload.name required")
		}
		// Le parent doit exister et appartenir à l'utilisateur (NOT_FOUND sinon,
		// cohérent avec move_resource). Ordre du SAF walk : parent avant enfant.
		if p.ParentResourceID != "" {
			if _, err := s.Repo.GetFolder(ownerID, p.ParentResourceID); err != nil {
				return err
			}
		}
		if op.ResourceType == "folder" {
			return s.Repo.InsertFolder(ownerID, op.ResourceID, p.Name, p.ParentResourceID)
		}
		mime := p.MimeType
		return s.Repo.InsertFile(ownerID, op.ResourceID, p.Name, p.ParentResourceID, 0, &mime, nullableString(p.Extension))

	case OpUpdateMetadata:
		exists, err := s.Repo.ExistsOwner(ownerID, op.ResourceID)
		if err != nil {
			return err
		}
		if !exists {
			return nil
		}
		var p renamePayload
		if err := json.Unmarshal(op.Payload, &p); err != nil {
			return errors.New("invalid payload: " + err.Error())
		}
		if p.Name == "" {
			return errors.New("payload.name required")
		}
		return s.Repo.UpdateName(ownerID, op.ResourceID, p.Name)

	case OpMoveResource:
		exists, err := s.Repo.ExistsOwner(ownerID, op.ResourceID)
		if err != nil {
			return err
		}
		if !exists {
			return nil
		}
		var p movePayload
		if err := json.Unmarshal(op.Payload, &p); err != nil {
			return errors.New("invalid payload: " + err.Error())
		}
		if p.ToFolderResourceID == op.ResourceID {
			return errors.New("cannot move a resource into itself")
		}
		return s.Repo.MoveResource(ownerID, op.ResourceID, p.ToFolderResourceID)

	case OpDeleteResource:
		return s.Repo.SyncDelete(ownerID, op.ResourceID)

	default:
		return errors.New("unknown operation " + op.Operation)
	}
}

func (s *Resources) recordApplied(deviceID string, op *SyncOperation) error {
	return s.Repository.Operations.Record(deviceID, op.OperationID, op.Operation, op.RefType, nullableInt64(op.RefID), op.ResourceID, op.Payload)
}

func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func nullableInt64(value int64) *int64 {
	if value == 0 {
		return nil
	}
	return &value
}

// ResourcePermission is the snapshot shape consumed by canAccess
// (docs/api-v1.md §6.2).
type ResourcePermission struct {
	ResourceID      string `json:"resource_id"`
	ResourceType    string `json:"resourceType"`
	EffectiveAccess string `json:"effectiveAccess"`
	Inherit         bool   `json:"inherit"`
	OwnerID         string `json:"ownerId"`
	SharedByID      any    `json:"sharedById"`
	ExpiresAt       any    `json:"expiresAt"`
	CachedAt        int64  `json:"cachedAt"`
	UpdatedAt       int64  `json:"updatedAt"`
}

// Snapshot returns the delta of effective permissions for the user since
// afterMs (epoch ms; 0 = all). V1 : pas encore de partage entre users — toutes
// les ressources appartiennent au user appelant (effective_access = owner).
func (s *Resources) Snapshot(ownerID string, afterMs int64) ([]ResourcePermission, error) {
	rows, err := s.Repo.ListOwned(ownerID, afterMs)
	if err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	perms := make([]ResourcePermission, 0, len(rows))
	for _, row := range rows {
		perms = append(perms, ResourcePermission{
			ResourceID:      row.ID,
			ResourceType:    row.Type,
			EffectiveAccess: "owner",
			Inherit:         false,
			OwnerID:         ownerID,
			SharedByID:      nil,
			ExpiresAt:       nil,
			CachedAt:        now,
			UpdatedAt:       row.UpdatedAt.UnixMilli(),
		})
	}
	return perms, nil
}
