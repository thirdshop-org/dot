package service

import (
	"context"
	"database/sql"
	"encoding/hex"
	"fmt"
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
	queries *db.Queries
	cfg     *config.Config
}

func NewResourceService(queries *db.Queries, cfg *config.Config) *ResourceService {
	return &ResourceService{queries: queries, cfg: cfg}
}

func (s *ResourceService) Upload(file *multipart.FileHeader, ownerID string) (*model.UploadResult, error) {
	dst := filepath.Join(s.cfg.UploadDir, uuid.New().String()+filepath.Ext(file.Filename))

	if err := os.MkdirAll(s.cfg.UploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	if err := saveUploadedFile(file, dst); err != nil {
		return nil, fmt.Errorf("save file: %w", err)
	}

	data, err := os.ReadFile(dst)
	if err != nil {
		return nil, fmt.Errorf("read saved file: %w", err)
	}

	info, err := os.Stat(dst)
	if err != nil {
		return nil, fmt.Errorf("stat file: %w", err)
	}

	checksum := hex.EncodeToString(CreateSHA256Hash(data))

	ownerUUID, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, fmt.Errorf("parse owner id: %w", err)
	}

	existing, err := s.queries.FindDuplicateByChecksum(context.Background(), db.FindDuplicateByChecksumParams{
		Checksum: checksum,
		OwnerID:  ownerUUID,
	})
	if err == nil && existing.ID != uuid.Nil {
		os.Remove(dst)
		placement, err := s.queries.GetServerPlacementByResource(context.Background(), existing.ID)
		if err == nil {
			return &model.UploadResult{
				ID:       existing.ID.String(),
				Name:     existing.Name,
				Path:     placement.StorageKey.String,
				MimeType: existing.MimeType,
			}, nil
		}
	}

	dbResource, err := s.queries.CreateResource(context.Background(), db.CreateResourceParams{
		Name:     file.Filename,
		MimeType: file.Header.Get("Content-Type"),
		Size:     info.Size(),
		Checksum: checksum,
		OwnerID:  ownerUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("create resource in db: %w", err)
	}

	placement, err := s.ensureServerPlacement(dbResource.ID, ownerUUID, dst)
	if err != nil {
		return nil, fmt.Errorf("create server placement: %w", err)
	}

	if err := s.ensureOwnerRebac(dbResource.ID, ownerUUID); err != nil {
		return nil, fmt.Errorf("create owner rebac: %w", err)
	}

	return &model.UploadResult{
		ID:       dbResource.ID.String(),
		Name:     dbResource.Name,
		Path:     placement.StorageKey.String,
		MimeType: dbResource.MimeType,
	}, nil
}

func (s *ResourceService) ensureServerPlacement(resourceID, ownerID uuid.UUID, dst string) (db.ResourcePlacement, error) {
	serverLoc, err := s.queries.GetServerStorageLocation(context.Background(), ownerID)
	if err != nil {
		return db.ResourcePlacement{}, fmt.Errorf("get server location: %w", err)
	}

	placement, err := s.queries.CreatePlacement(context.Background(), db.CreatePlacementParams{
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

func (s *ResourceService) ensureOwnerRebac(resourceID, ownerID uuid.UUID) error {
	_, err := s.queries.CreateRebacRelation(context.Background(), db.CreateRebacRelationParams{
		ResourceID:    resourceID,
		SubjectUserID: ownerID,
		Role:          "owner",
		GrantedBy:     ownerID,
	})
	return err
}

func (s *ResourceService) List(ownerID string) ([]model.Resource, error) {
	ownerUUID, _ := uuid.Parse(ownerID)
	dbResources, err := s.queries.ListResourcesByOwner(context.Background(), ownerUUID)
	if err != nil {
		return nil, fmt.Errorf("list resources: %w", err)
	}

	resources := make([]model.Resource, len(dbResources))
	for i, r := range dbResources {
		tags, err := s.queries.GetTagsByResourceID(context.Background(), r.ID)
		if err != nil {
			return nil, fmt.Errorf("get tags for resource %s: %w", r.ID, err)
		}
		resources[i] = dbResourceToModel(r, tags)
	}
	return resources, nil
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
	r, err := s.queries.CreateFolder(context.Background(), db.CreateFolderParams{
		Name:    name,
		OwnerID: ownerUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("create folder: %w", err)
	}

	if err := s.ensureOwnerRebac(r.ID, ownerUUID); err != nil {
		return nil, fmt.Errorf("create owner rebac: %w", err)
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

func (s *ResourceService) ListResourcesByParentID(parentID, ownerID string) ([]model.Resource, error) {
	parentUUID, _ := uuid.Parse(parentID)
	ownerUUID, _ := uuid.Parse(ownerID)
	dbResources, err := s.queries.ListResourcesByParentAndOwner(context.Background(), db.ListResourcesByParentAndOwnerParams{
		ParentResourceID: uuid.NullUUID{UUID: parentUUID, Valid: true},
		OwnerID:          ownerUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("list resources by parent: %w", err)
	}
	resources := make([]model.Resource, len(dbResources))
	for i, r := range dbResources {
		tags, err := s.queries.GetTagsByResourceID(context.Background(), r.ID)
		if err != nil {
			return nil, fmt.Errorf("get tags for resource %s: %w", r.ID, err)
		}
		resources[i] = dbResourceToModel(r, tags)
	}
	return resources, nil
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

func saveUploadedFile(file *multipart.FileHeader, dst string) error {
	src, err := file.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	buf := make([]byte, 32*1024)
	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, writeErr := out.Write(buf[:n]); writeErr != nil {
				return writeErr
			}
		}
		if readErr != nil {
			break
		}
	}
	return nil
}
