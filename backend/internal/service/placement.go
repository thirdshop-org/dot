package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/vaultdrop/backend/internal/db"
)

type PlacementService struct {
	queries *db.Queries
}

func NewPlacementService(queries *db.Queries) *PlacementService {
	return &PlacementService{queries: queries}
}

func (s *PlacementService) GetPlacementsForResource(resourceID string) ([]db.ResourcePlacement, error) {
	resourceUUID, _ := uuid.Parse(resourceID)
	return s.queries.ListPlacementsByResource(context.Background(), resourceUUID)
}

func (s *PlacementService) GetPlacementsForLocation(locationID string) ([]db.ResourcePlacement, error) {
	locationUUID, _ := uuid.Parse(locationID)
	return s.queries.ListPlacementsByLocation(context.Background(), locationUUID)
}

func (s *PlacementService) UpdatePlacementStatus(placementID, status string) error {
	placementUUID, _ := uuid.Parse(placementID)
	return s.queries.UpdatePlacementStatus(context.Background(), db.UpdatePlacementStatusParams{
		Status: status,
		ID:     placementUUID,
	})
}

func (s *PlacementService) DeletePlacement(placementID string) error {
	placementUUID, _ := uuid.Parse(placementID)
	return s.queries.DeletePlacement(context.Background(), placementUUID)
}

func (s *PlacementService) CreateDeviceLocation(userID, deviceName string) (db.StorageLocation, error) {
	userUUID, _ := uuid.Parse(userID)
	return s.queries.CreateStorageLocation(context.Background(), db.CreateStorageLocationParams{
		UserID:     userUUID,
		DeviceName: deviceName,
		Role:       "device",
	})
}

func (s *PlacementService) ListUserLocations(userID string) ([]db.StorageLocation, error) {
	userUUID, _ := uuid.Parse(userID)
	return s.queries.ListStorageLocationsByUser(context.Background(), userUUID)
}

func (s *PlacementService) ensureServerLocation(userID uuid.UUID) (db.StorageLocation, error) {
	loc, err := s.queries.GetServerStorageLocation(context.Background(), userID)
	if err != nil {
		return s.queries.CreateStorageLocation(context.Background(), db.CreateStorageLocationParams{
			UserID:     userID,
			DeviceName: "VaultDrop Server",
			Role:       "server",
		})
	}
	return loc, nil
}
