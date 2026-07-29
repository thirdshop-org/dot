package handler

import (
	"fmt"
	"io"

	"github.com/gin-gonic/gin"
	"github.com/vaultdrop/backend/internal/service"
)

type EventHandler struct {
	broker *service.EventBroker
}

func NewEventHandler(broker *service.EventBroker) *EventHandler {
	return &EventHandler{broker: broker}
}

func (h *EventHandler) Stream(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	ch, _ := h.broker.Subscribe(c.Request.Context())

	c.Stream(func(w io.Writer) bool {
		event, ok := <-ch
		if !ok {
			return false
		}
		_, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, event.Data)
		return err == nil
	})
}
