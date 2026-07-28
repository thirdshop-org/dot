package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/vaultdrop/backend/internal/db"
)

type RebacService struct {
	queries *db.Queries
}

func NewRebacService(queries *db.Queries) *RebacService {
	return &RebacService{queries: queries}
}

func (s *RebacService) ResolveEffectiveRole(userID, resourceID string) (string, error) {
	userUUID, _ := uuid.Parse(userID)
	resourceUUID, _ := uuid.Parse(resourceID)
	role, err := s.queries.ResolveEffectiveRole(context.Background(), db.ResolveEffectiveRoleParams{
		PUserID:     userUUID,
		PResourceID: resourceUUID,
	})
	if err != nil {
		return "", fmt.Errorf("resolve effective role: %w", err)
	}
	return role, nil
}

func (s *RebacService) HasRole(userID, resourceID, requiredRole string) (bool, error) {
	role, err := s.ResolveEffectiveRole(userID, resourceID)
	if err != nil {
		return false, err
	}
	return role == requiredRole, nil
}

func (s *RebacService) canGrant(granterRole string) bool {
	return granterRole == "owner" || granterRole == "admin"
}

func (s *RebacService) GrantRole(granterID, resourceID, subjectID, role string) error {
	granterUUID, _ := uuid.Parse(granterID)
	resourceUUID, _ := uuid.Parse(resourceID)
	subjectUUID, _ := uuid.Parse(subjectID)

	granterRole, err := s.ResolveEffectiveRole(granterID, resourceID)
	if err != nil {
		return fmt.Errorf("resolve granter role: %w", err)
	}
	if !s.canGrant(granterRole) {
		return fmt.Errorf("granter does not have permission to grant roles")
	}

	_, err = s.queries.CreateRebacRelation(context.Background(), db.CreateRebacRelationParams{
		ResourceID:    resourceUUID,
		SubjectUserID: subjectUUID,
		Role:          role,
		GrantedBy:     granterUUID,
	})
	if err != nil {
		return fmt.Errorf("create rebac relation: %w", err)
	}
	return nil
}

func (s *RebacService) RevokeRole(granterID, resourceID, subjectID string) error {
	granterRole, err := s.ResolveEffectiveRole(granterID, resourceID)
	if err != nil {
		return fmt.Errorf("resolve granter role: %w", err)
	}
	if !s.canGrant(granterRole) {
		return fmt.Errorf("granter does not have permission to revoke roles")
	}

	resourceUUID, _ := uuid.Parse(resourceID)
	subjectUUID, _ := uuid.Parse(subjectID)
	return s.queries.DeleteRebacRelation(context.Background(), db.DeleteRebacRelationParams{
		ResourceID:    resourceUUID,
		SubjectUserID: subjectUUID,
	})
}

func (s *RebacService) ListShares(resourceID string) ([]db.RebacRelation, error) {
	resourceUUID, _ := uuid.Parse(resourceID)
	return s.queries.ListRebacRelationsByResource(context.Background(), resourceUUID)
}
