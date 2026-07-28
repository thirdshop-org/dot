package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/vaultdrop/backend/internal/db"
)

type SyncService struct {
	queries *db.Queries
}

func NewSyncService(queries *db.Queries) *SyncService {
	return &SyncService{queries: queries}
}

func (s *SyncService) EnqueueUpload(resourceID, locationID string) error {
	resourceUUID, _ := uuid.Parse(resourceID)
	locationUUID, _ := uuid.Parse(locationID)
	_, err := s.queries.CreateSyncQueueItem(context.Background(), db.CreateSyncQueueItemParams{
		ResourceID:        resourceUUID,
		StorageLocationID: locationUUID,
		Operation:         "upload",
		Status:            "pending",
		Attempts:          0,
	})
	return err
}

func (s *SyncService) EnqueueDownload(resourceID, locationID string) error {
	resourceUUID, _ := uuid.Parse(resourceID)
	locationUUID, _ := uuid.Parse(locationID)
	_, err := s.queries.CreateSyncQueueItem(context.Background(), db.CreateSyncQueueItemParams{
		ResourceID:        resourceUUID,
		StorageLocationID: locationUUID,
		Operation:         "download",
		Status:            "pending",
		Attempts:          0,
	})
	return err
}

func (s *SyncService) ListPending(locationID string) ([]db.SyncQueue, error) {
	locationUUID, _ := uuid.Parse(locationID)
	return s.queries.ListPendingSyncItemsByLocation(context.Background(), locationUUID)
}

func (s *SyncService) ListAllPending() ([]db.SyncQueue, error) {
	return s.queries.ListPendingSyncItems(context.Background())
}

func (s *SyncService) MarkCompleted(queueID string) error {
	id, _ := uuid.Parse(queueID)
	return s.queries.UpdateSyncQueueStatus(context.Background(), db.UpdateSyncQueueStatusParams{
		Status:   "completed",
		Attempts: 0,
		ID:       id,
	})
}

func (s *SyncService) MarkFailed(queueID string, errMsg string) error {
	id, _ := uuid.Parse(queueID)
	item, err := s.queries.GetSyncQueueItem(context.Background(), id)
	if err != nil {
		return fmt.Errorf("get sync queue item: %w", err)
	}
	return s.queries.UpdateSyncQueueStatus(context.Background(), db.UpdateSyncQueueStatusParams{
		Status:   "failed",
		Attempts: int32(item.Attempts + 1),
		ID:       id,
	})
}
