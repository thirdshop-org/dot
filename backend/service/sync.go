package service

import (
	"encoding/json"
	"errors"
	"regexp"
	"time"

	"github.com/vaultdrop/backend/repository"
)

var resourceIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// Ops de l'outbox (docs/api-v1.md §6.1).
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

// SyncOperation is one outbox entry (shadow of mobile PendingOperationRow).
type SyncOperation struct {
	OperationID  string          `json:"operation_id"`
	RefType      *string         `json:"ref_type"`
	RefID        *int64          `json:"ref_id"`
	ResourceID   *string         `json:"resource_id"`
	ResourceType *string         `json:"resource_type"`
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

type sharePayload struct {
	GranteeUserID string `json:"granteeUserId"`
	Access        string `json:"access"`
	Inherit       *bool  `json:"inherit"`
	ExpiresAt     *int64 `json:"expiresAt"`
}

type revokeSharePayload struct {
	GranteeUserID string `json:"granteeUserId"`
}

type linkPayload struct {
	Token     string `json:"token"`
	Access    string `json:"access"`
	ExpiresAt *int64 `json:"expiresAt"`
}

type revokeLinkPayload struct {
	Token string `json:"token"`
}

func classifySyncError(err error) (string, string) {
	switch {
	case errors.Is(err, repository.ErrNameConflict):
		return "NAME_CONFLICT", "a resource with this name already exists here"
	case errors.Is(err, repository.ErrNotFound):
		return "NOT_FOUND", "target resource or folder not found"
	case errors.Is(err, repository.ErrGranteeNotFound):
		return "GRANTEE_NOT_FOUND", "the specified user does not exist"
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
	if !resourceIDPattern.MatchString(derefString(op.ResourceID)) {
		return errors.New("resource_id must be 32 lowercase hex chars")
	}
	switch op.Operation {
	case OpCreateResource, OpUpdateMetadata, OpMoveResource, OpDeleteResource,
		OpShare, OpRevokeShare, OpUpdateShare, OpCreateLink, OpRevokeLink:
	default:
		return errors.New("unknown operation " + op.Operation)
	}
	if derefString(op.ResourceType) != "folder" && derefString(op.ResourceType) != "file" {
		return errors.New("resource_type must be 'folder' or 'file'")
	}
	return nil
}

func (s *Resources) applySyncOp(ownerID string, op *SyncOperation) error {
	resourceID := derefString(op.ResourceID)
	switch op.Operation {
	case OpCreateResource:
		exists, err := s.Repo.ExistsOwner(ownerID, resourceID)
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
		if derefString(op.ResourceType) == "folder" {
			return s.Repo.InsertFolder(ownerID, resourceID, p.Name, p.ParentResourceID)
		}
		mime := p.MimeType
		return s.Repo.InsertFile(ownerID, resourceID, p.Name, p.ParentResourceID, 0, &mime, nullableString(p.Extension))

	case OpUpdateMetadata:
		// Owner can always rename. A shared resource can be renamed by an
		// editor+ (docs §6.2 effective_access ranking). Below editor, or on
		// a resource the caller cannot reach at all, we keep the documented
		// terminal-state semantics: absent → no-op.
		access, err := s.Repository.Shares.EffectiveAccess(ownerID, resourceID)
		if err != nil {
			return err
		}
		if access.EffectiveRank < repository.AccessEditor {
			if !access.Accessible {
				return nil
			}
			return repository.ErrNotFound
		}
		var p renamePayload
		if err := json.Unmarshal(op.Payload, &p); err != nil {
			return errors.New("invalid payload: " + err.Error())
		}
		if p.Name == "" {
			return errors.New("payload.name required")
		}
		return s.Repo.UpdateNameByID(resourceID, p.Name)

	case OpMoveResource:
		exists, err := s.Repo.ExistsOwner(ownerID, resourceID)
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
		if p.ToFolderResourceID == resourceID {
			return errors.New("cannot move a resource into itself")
		}
		return s.Repo.MoveResource(ownerID, resourceID, p.ToFolderResourceID)

	case OpDeleteResource:
		return s.Repo.SyncDelete(ownerID, resourceID)

	case OpShare, OpUpdateShare:
		return s.applyShareOp(ownerID, resourceID, op)

	case OpRevokeShare:
		return s.applyRevokeShareOp(ownerID, resourceID, op)

	case OpCreateLink:
		return s.applyCreateLinkOp(ownerID, resourceID, op)

	case OpRevokeLink:
		return s.applyRevokeLinkOp(ownerID, resourceID, op)

	default:
		return errors.New("unknown operation " + op.Operation)
	}
}

// applyShareOp handles OpShare and OpUpdateShare: upsert a user-to-user grant.
func (s *Resources) applyShareOp(ownerID, resourceID string, op *SyncOperation) error {
	exists, err := s.Repo.ExistsOwner(ownerID, resourceID)
	if err != nil {
		return err
	}
	if !exists {
		return repository.ErrNotFound
	}
	var p sharePayload
	if err := json.Unmarshal(op.Payload, &p); err != nil {
		return errors.New("invalid payload: " + err.Error())
	}
	if p.GranteeUserID == "" {
		return errors.New("payload.granteeUserId required")
	}
	if !resourceIDPattern.MatchString(p.GranteeUserID) {
		return errors.New("payload.granteeUserId must be 32 lowercase hex chars")
	}
	rank := repository.AccessFromString(p.Access)
	if rank < repository.AccessViewer || rank > repository.AccessEditor {
		return errors.New("payload.access must be viewer, commenter, or editor")
	}
	// Validate grantee exists and is active.
	if _, err := s.Repository.Users.GetByID(p.GranteeUserID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return repository.ErrGranteeNotFound
		}
		return err
	}
	inherit := true
	if p.Inherit != nil {
		inherit = *p.Inherit
	}
	var expiresAt *time.Time
	if p.ExpiresAt != nil {
		t := time.UnixMilli(*p.ExpiresAt)
		expiresAt = &t
	}
	if err := s.Repository.Shares.Upsert(resourceID, p.GranteeUserID, p.Access, inherit, expiresAt, ownerID); err != nil {
		return err
	}
	// Bump resource updated_at so the grantee's delta snapshot picks it up.
	return s.Repo.TouchResource(resourceID)
}

// applyRevokeShareOp handles OpRevokeShare: soft-revoke a user-to-user grant.
func (s *Resources) applyRevokeShareOp(ownerID, resourceID string, op *SyncOperation) error {
	exists, err := s.Repo.ExistsOwner(ownerID, resourceID)
	if err != nil {
		return err
	}
	if !exists {
		return repository.ErrNotFound
	}
	var p revokeSharePayload
	if err := json.Unmarshal(op.Payload, &p); err != nil {
		return errors.New("invalid payload: " + err.Error())
	}
	if p.GranteeUserID == "" {
		return errors.New("payload.granteeUserId required")
	}
	if !resourceIDPattern.MatchString(p.GranteeUserID) {
		return errors.New("payload.granteeUserId must be 32 lowercase hex chars")
	}
	// Revoke is idempotent: no-op if already revoked/missing.
	_ = s.Repository.Shares.Revoke(resourceID, p.GranteeUserID)
	// Bump resource updated_at so the grantee's delta snapshot reflects the change.
	return s.Repo.TouchResource(resourceID)
}

// applyCreateLinkOp handles OpCreateLink: create a public share link.
func (s *Resources) applyCreateLinkOp(ownerID, resourceID string, op *SyncOperation) error {
	exists, err := s.Repo.ExistsOwner(ownerID, resourceID)
	if err != nil {
		return err
	}
	if !exists {
		return repository.ErrNotFound
	}
	var p linkPayload
	if err := json.Unmarshal(op.Payload, &p); err != nil {
		return errors.New("invalid payload: " + err.Error())
	}
	if !resourceIDPattern.MatchString(p.Token) {
		return errors.New("payload.token must be 32 lowercase hex chars")
	}
	rank := repository.AccessFromString(p.Access)
	if rank < repository.AccessViewer || rank > repository.AccessEditor {
		return errors.New("payload.access must be viewer, commenter, or editor")
	}
	var expiresAt *time.Time
	if p.ExpiresAt != nil {
		t := time.UnixMilli(*p.ExpiresAt)
		expiresAt = &t
	}
	if err := s.Repository.Shares.CreateLink(p.Token, resourceID, p.Access, expiresAt, ownerID); err != nil {
		return err
	}
	return s.Repo.TouchResource(resourceID)
}

// applyRevokeLinkOp handles OpRevokeLink: soft-revoke a public share link.
func (s *Resources) applyRevokeLinkOp(ownerID, resourceID string, op *SyncOperation) error {
	exists, err := s.Repo.ExistsOwner(ownerID, resourceID)
	if err != nil {
		return err
	}
	if !exists {
		return repository.ErrNotFound
	}
	var p revokeLinkPayload
	if err := json.Unmarshal(op.Payload, &p); err != nil {
		return errors.New("invalid payload: " + err.Error())
	}
	if !resourceIDPattern.MatchString(p.Token) {
		return errors.New("payload.token must be 32 lowercase hex chars")
	}
	// Revoke is idempotent: no-op if already revoked/missing.
	_ = s.Repository.Shares.RevokeLink(p.Token)
	return s.Repo.TouchResource(resourceID)
}

func (s *Resources) recordApplied(deviceID string, op *SyncOperation) error {
	return s.Repository.Operations.Record(deviceID, op.OperationID, op.Operation, derefString(op.RefType), nullableInt64(derefInt64(op.RefID)), derefString(op.ResourceID), op.Payload)
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func derefInt64(v *int64) int64 {
	if v == nil {
		return 0
	}
	return *v
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
	ResourceID      string  `json:"resource_id"`
	ResourceType    string  `json:"resourceType"`
	EffectiveAccess string  `json:"effectiveAccess"`
	Name            string  `json:"name"`
	ParentID        *string `json:"parentId"`
	Inherit         bool    `json:"inherit"`
	OwnerID         string  `json:"ownerId"`
	SharedByID      *string `json:"sharedById"`
	ExpiresAt       *int64  `json:"expiresAt"`
	CachedAt        int64   `json:"cachedAt"`
	UpdatedAt       int64   `json:"updatedAt"`
}

// Snapshot returns the delta of effective permissions for the user since
// afterMs (epoch ms; 0 = all). Uses the recursive CTE computed by
// repository.Shares.ListEffectivePermissions.
func (s *Resources) Snapshot(ownerID string, afterMs int64) ([]ResourcePermission, error) {
	perms, err := s.Repository.Shares.ListEffectivePermissions(ownerID, afterMs)
	if err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	out := make([]ResourcePermission, 0, len(perms))
	for _, p := range perms {
		rp := ResourcePermission{
			ResourceID:      p.ResourceID,
			ResourceType:    p.ResourceType,
			EffectiveAccess: repository.AccessToString(p.EffectiveRank),
			Name:            p.Name,
			ParentID:        p.ParentID,
			Inherit:         p.Inherit,
			OwnerID:         p.OwnerID,
			SharedByID:      p.SharedByID,
			CachedAt:        now,
			UpdatedAt:       p.UpdatedAt.UnixMilli(),
		}
		if p.ExpiresAt != nil {
			ms := p.ExpiresAt.UnixMilli()
			rp.ExpiresAt = &ms
		}
		out = append(out, rp)
	}
	return out, nil
}
