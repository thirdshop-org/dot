package handler

import (
	"github.com/vaultdrop/backend/internal/auth"
	"github.com/vaultdrop/backend/internal/service"
)

type Handler struct {
	Resource  *ResourceHandler
	OCR       *OCRHandler
	Health    *HealthHandler
	Auth      *auth.AuthHandler
	Share     *ShareHandler
	Device    *DeviceHandler
	Sync      *SyncHandler
	Events    *EventHandler
}

func New(
	resourceSvc *service.ResourceService,
	ocrSvc *service.OCRService,
	urlSvc *service.URLService,
	authHandler *auth.AuthHandler,
	conversionSvc *service.ConversionService,
	rebacSvc *service.RebacService,
	placementSvc *service.PlacementService,
	syncSvc *service.SyncService,
	eventBroker *service.EventBroker,
) *Handler {
	return &Handler{
		Resource: &ResourceHandler{
			resources:  resourceSvc,
			urls:       urlSvc,
			ocr:        ocrSvc,
			conversion: conversionSvc,
		},
		OCR:    &OCRHandler{ocr: ocrSvc, resources: resourceSvc},
		Health: &HealthHandler{ocr: ocrSvc},
		Auth:   authHandler,
		Share:  &ShareHandler{rebac: rebacSvc},
		Device: &DeviceHandler{placement: placementSvc},
		Sync:   &SyncHandler{sync: syncSvc},
		Events: NewEventHandler(eventBroker),
	}
}
