package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/vaultdrop/backend/internal/config"
	"github.com/vaultdrop/backend/internal/db"
	"github.com/vaultdrop/backend/internal/model"
)

type ResourceService struct {
	db      *sql.DB
	queries *db.Queries
	cfg     *config.Config
}

func NewResourceService(database *sql.DB, queries *db.Queries, cfg *config.Config) *ResourceService {
	return &ResourceService{db: database, queries: queries, cfg: cfg}
}

func (s *ResourceService) Upload(file *multipart.FileHeader, ownerID string) (*model.UploadResult, error) {
	dst := filepath.Join(s.cfg.UploadDir, uuid.New().String()+filepath.Ext(file.Filename))

	if err := os.MkdirAll(s.cfg.UploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	h := sha256.New()
	checksum, err := saveUploadedFile(file, dst, h)
	if err != nil {
		return nil, fmt.Errorf("save file: %w", err)
	}

	ownerUUID, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, fmt.Errorf("parse owner id: %w", err)
	}

	ctx := context.Background()

	existing, err := s.queries.FindDuplicateByChecksum(ctx, db.FindDuplicateByChecksumParams{
		Checksum: checksum,
		OwnerID:  ownerUUID,
	})
	if err == nil && existing.ID != uuid.Nil {
		os.Remove(dst)
		placement, err := s.queries.GetServerPlacementByResource(ctx, existing.ID)
		if err == nil {
			return &model.UploadResult{
				ID:       existing.ID.String(),
				Name:     existing.Name,
				Path:     placement.StorageKey.String,
				MimeType: existing.MimeType,
			}, nil
		}
		return nil, fmt.Errorf("duplicate resource %s has no server placement — upload cannot proceed until resolved", existing.ID.String())
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	dbResource, err := qtx.CreateResource(ctx, db.CreateResourceParams{
		Name:     file.Filename,
		MimeType: file.Header.Get("Content-Type"),
		Size:     file.Size,
		Checksum: checksum,
		OwnerID:  ownerUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("create resource in db: %w", err)
	}

	placement, err := s.ensureServerPlacementQtx(qtx, dbResource.ID, ownerUUID, dst)
	if err != nil {
		return nil, fmt.Errorf("create server placement: %w", err)
	}

	if _, err := qtx.CreateRebacRelation(ctx, db.CreateRebacRelationParams{
		ResourceID:    dbResource.ID,
		SubjectUserID: ownerUUID,
		Role:          "owner",
		GrantedBy:     ownerUUID,
	}); err != nil {
		return nil, fmt.Errorf("create owner rebac: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	return &model.UploadResult{
		ID:       dbResource.ID.String(),
		Name:     dbResource.Name,
		Path:     placement.StorageKey.String,
		MimeType: dbResource.MimeType,
	}, nil
}

func (s *ResourceService) ensureServerPlacement(resourceID, ownerID uuid.UUID, dst string) (db.ResourcePlacement, error) {
	return s.ensureServerPlacementQtx(s.queries, resourceID, ownerID, dst)
}

func (s *ResourceService) ensureServerPlacementQtx(q *db.Queries, resourceID, ownerID uuid.UUID, dst string) (db.ResourcePlacement, error) {
	ctx := context.Background()
	serverLoc, err := q.GetServerStorageLocation(ctx, ownerID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			serverLoc, err = q.CreateStorageLocation(ctx, db.CreateStorageLocationParams{
				UserID:     ownerID,
				DeviceName: "VaultDrop Server",
				Role:       "server",
			})
		}
		if err != nil {
			return db.ResourcePlacement{}, fmt.Errorf("get/create server location: %w", err)
		}
	}

	placement, err := q.CreatePlacement(ctx, db.CreatePlacementParams{
		ResourceID:        resourceID,
		StorageLocationID: serverLoc.ID,
		Status:            "synced",
		StorageKey:        sql.NullString{String: dst, Valid: true},
		SyncedAt:          sql.NullTime{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return db.ResourcePlacement{}, fmt.Errorf("create placement: %w", err)
	}

	return placement, nil
}

func (s *ResourceService) List(ownerID string, page, limit int) ([]model.Resource, int, error) {
	ownerUUID, _ := uuid.Parse(ownerID)

	total, err := s.queries.CountResourcesByOwner(context.Background(), ownerUUID)
	if err != nil {
		return nil, 0, fmt.Errorf("count resources: %w", err)
	}

	offset := (page - 1) * limit
	dbResources, err := s.queries.ListResourcesByOwner(context.Background(), db.ListResourcesByOwnerParams{
		OwnerID: ownerUUID,
		Limit:   int32(limit),
		Offset:  int32(offset),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list resources: %w", err)
	}

	resources := make([]model.Resource, len(dbResources))
	for i, r := range dbResources {
		tags, err := s.queries.GetTagsByResourceID(context.Background(), r.ID)
		if err != nil {
			return nil, 0, fmt.Errorf("get tags for resource %s: %w", r.ID, err)
		}
		resources[i] = dbResourceToModel(r, tags)
	}
	return resources, int(total), nil
}

func (s *ResourceService) Get(id string) (*model.Resource, error) {
	resourceUUID, _ := uuid.Parse(id)
	r, err := s.queries.GetResource(context.Background(), resourceUUID)
	if err != nil {
		return nil, fmt.Errorf("get resource: %w", err)
	}
	tags, err := s.queries.GetTagsByResourceID(context.Background(), r.ID)
	if err != nil {
		return nil, fmt.Errorf("get tags: %w", err)
	}
	m := dbResourceToModel(r, tags)
	return &m, nil
}

func (s *ResourceService) Delete(id string) error {
	resourceUUID, _ := uuid.Parse(id)
	return s.queries.DeleteResource(context.Background(), resourceUUID)
}

func (s *ResourceService) GetStoragePath(id string) (string, error) {
	resourceUUID, _ := uuid.Parse(id)
	placement, err := s.queries.GetServerPlacementByResource(context.Background(), resourceUUID)
	if err != nil {
		return "", fmt.Errorf("get server placement for resource %s: %w", id, err)
	}
	return placement.StorageKey.String, nil
}

func (s *ResourceService) UpdateOCRText(id, text string) error {
	resourceUUID, _ := uuid.Parse(id)
	r, err := s.queries.GetResource(context.Background(), resourceUUID)
	if err != nil {
		return fmt.Errorf("get resource: %w", err)
	}
	return s.queries.UpdateResource(context.Background(), db.UpdateResourceParams{
		Name:     r.Name,
		MimeType: r.MimeType,
		OcrText:  text,
		ID:       resourceUUID,
	})
}

func (s *ResourceService) AddTags(resourceID string, tagNames []string) error {
	resourceUUID, _ := uuid.Parse(resourceID)
	for _, name := range tagNames {
		tag, err := s.queries.GetTagByName(context.Background(), name)
		if err == sql.ErrNoRows {
			tag, err = s.queries.CreateTag(context.Background(), name)
			if err != nil {
				return fmt.Errorf("create tag %q: %w", name, err)
			}
		} else if err != nil {
			return fmt.Errorf("get tag %q: %w", name, err)
		}

		err = s.queries.AddTagToResource(context.Background(), db.AddTagToResourceParams{
			TagID:      tag.ID,
			ResourceID: resourceUUID,
		})
		if err != nil {
			return fmt.Errorf("link tag %q to resource: %w", name, err)
		}
	}
	return nil
}

func (s *ResourceService) GetTagsByResourceID(resourceID string) ([]model.Tag, error) {
	resourceUUID, _ := uuid.Parse(resourceID)
	dbTags, err := s.queries.GetTagsByResourceID(context.Background(), resourceUUID)
	if err != nil {
		return nil, fmt.Errorf("get tags: %w", err)
	}
	tags := make([]model.Tag, len(dbTags))
	for i, t := range dbTags {
		tags[i] = model.Tag{ID: t.ID.String(), Name: t.TagName}
	}
	return tags, nil
}

func (s *ResourceService) MoveResources(resourceIDs []string, parentResourceID *string) error {
	uuids := make([]uuid.UUID, len(resourceIDs))
	for i, id := range resourceIDs {
		uuids[i], _ = uuid.Parse(id)
	}
	var parentID uuid.NullUUID
	if parentResourceID != nil {
		pid, _ := uuid.Parse(*parentResourceID)
		parentID = uuid.NullUUID{UUID: pid, Valid: true}
	}
	return s.queries.MoveResources(context.Background(), db.MoveResourcesParams{
		ParentResourceID: parentID,
		Column2:          uuids,
	})
}

func (s *ResourceService) CreateFolder(name, ownerID string) (*model.Resource, error) {
	ownerUUID, _ := uuid.Parse(ownerID)
	ctx := context.Background()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	qtx := s.queries.WithTx(tx)

	r, err := qtx.CreateFolder(ctx, db.CreateFolderParams{
		Name:    name,
		OwnerID: ownerUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("create folder: %w", err)
	}

	if _, err := qtx.CreateRebacRelation(ctx, db.CreateRebacRelationParams{
		ResourceID:    r.ID,
		SubjectUserID: ownerUUID,
		Role:          "owner",
		GrantedBy:     ownerUUID,
	}); err != nil {
		return nil, fmt.Errorf("create owner rebac: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	m := dbResourceToModel(r, nil)
	return &m, nil
}

func (s *ResourceService) ListFolders(ownerID string) ([]model.Resource, error) {
	dbResources, err := s.queries.ListFolders(context.Background())
	if err != nil {
		return nil, fmt.Errorf("list folders: %w", err)
	}
	folders := make([]model.Resource, len(dbResources))
	for i, r := range dbResources {
		folders[i] = dbResourceToModel(r, nil)
	}
	return folders, nil
}

func (s *ResourceService) ListResourcesByParentID(parentID, ownerID string, page, limit int) ([]model.Resource, int, error) {
	parentUUID, _ := uuid.Parse(parentID)
	ownerUUID, _ := uuid.Parse(ownerID)

	total, err := s.queries.CountResourcesByParentAndOwner(context.Background(), db.CountResourcesByParentAndOwnerParams{
		ParentResourceID: uuid.NullUUID{UUID: parentUUID, Valid: true},
		OwnerID:          ownerUUID,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("count resources by parent: %w", err)
	}

	offset := (page - 1) * limit
	dbResources, err := s.queries.ListResourcesByParentAndOwner(context.Background(), db.ListResourcesByParentAndOwnerParams{
		ParentResourceID: uuid.NullUUID{UUID: parentUUID, Valid: true},
		OwnerID:          ownerUUID,
		Limit:            int32(limit),
		Offset:           int32(offset),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list resources by parent: %w", err)
	}
	resources := make([]model.Resource, len(dbResources))
	for i, r := range dbResources {
		tags, err := s.queries.GetTagsByResourceID(context.Background(), r.ID)
		if err != nil {
			return nil, 0, fmt.Errorf("get tags for resource %s: %w", r.ID, err)
		}
		resources[i] = dbResourceToModel(r, tags)
	}
	return resources, int(total), nil
}

func (s *ResourceService) GetVariantsByResourceID(resourceID string) ([]model.Variant, error) {
	resourceUUID, _ := uuid.Parse(resourceID)
	dbVariants, err := s.queries.GetVariantsByResourceID(context.Background(), resourceUUID)
	if err != nil {
		return nil, fmt.Errorf("get variants: %w", err)
	}

	variants := make([]model.Variant, len(dbVariants))
	for i, v := range dbVariants {
		variants[i] = model.Variant{
			ID:          v.ID.String(),
			ResourceID:  v.ResourceID.String(),
			VariantType: v.VariantType,
			PageNumber:  int(v.PageNumber),
			Width:       int(v.Width),
			Height:      int(v.Height),
			StorageKey:  v.StorageKey,
			MimeType:    v.MimeType,
			GeneratedBy: v.GeneratedBy,
			CreatedAt:   v.CreatedAt.String(),
		}
	}
	return variants, nil
}

func (s *ResourceService) GetVariantStoragePath(id string) (string, error) {
	variantUUID, _ := uuid.Parse(id)
	v, err := s.queries.GetVariantByID(context.Background(), variantUUID)
	if err != nil {
		return "", fmt.Errorf("get variant: %w", err)
	}
	return v.StorageKey, nil
}

func (s *ResourceService) GetBestVariant(resourceID, preferredType string) *model.Variant {
	resourceUUID, _ := uuid.Parse(resourceID)
	dbVariants, err := s.queries.GetVariantsByResourceID(context.Background(), resourceUUID)
	if err != nil || len(dbVariants) == 0 {
		return nil
	}

	var fallback *model.Variant
	for _, v := range dbVariants {
		if v.PageNumber != 1 {
			continue
		}
		mv := &model.Variant{
			ID:          v.ID.String(),
			ResourceID:  v.ResourceID.String(),
			VariantType: v.VariantType,
			PageNumber:  int(v.PageNumber),
			Width:       int(v.Width),
			Height:      int(v.Height),
			StorageKey:  v.StorageKey,
			MimeType:    v.MimeType,
			GeneratedBy: v.GeneratedBy,
			CreatedAt:   v.CreatedAt.String(),
		}
		if v.VariantType == preferredType {
			return mv
		}
		if fallback == nil {
			fallback = mv
		}
	}
	return fallback
}

func (s *ResourceService) FindDuplicatesByNameSize(name string, size int64) ([]db.FindDuplicatesByNameSizeRow, error) {
	return s.queries.FindDuplicatesByNameSize(context.Background(), db.FindDuplicatesByNameSizeParams{
		Name: name,
		Size: size,
	})
}

func dbResourceToModel(r db.Resource, dbTags []db.Tag) model.Resource {
	tags := make([]model.Tag, len(dbTags))
	for i, t := range dbTags {
		tags[i] = model.Tag{ID: t.ID.String(), Name: t.TagName}
	}

	parentID := ""
	if r.ParentResourceID.Valid {
		parentID = r.ParentResourceID.UUID.String()
	}

	return model.Resource{
		ID:               r.ID.String(),
		Name:             r.Name,
		MimeType:         r.MimeType,
		Size:             r.Size,
		OcrText:          r.OcrText,
		IsFolder:         r.IsFolder,
		ParentResourceID: parentID,
		OwnerID:          r.OwnerID.String(),
		Tags:             tags,
		CreatedAt:        r.CreatedAt,
		UpdatedAt:        r.UpdatedAt,
	}
}

func saveUploadedFile(file *multipart.FileHeader, dst string, h hash.Hash) (string, error) {
	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	out, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	defer out.Close()

	writer := io.MultiWriter(out, h)
	if _, err := io.CopyN(writer, src, file.Size); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}
