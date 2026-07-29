package service

import (
	"context"
	"sync"

	"github.com/google/uuid"
)

type Event struct {
	Type string
	Data string
}

type EventBroker struct {
	mu          sync.RWMutex
	subscribers map[string]chan Event
}

func NewEventBroker() *EventBroker {
	return &EventBroker{
		subscribers: make(map[string]chan Event),
	}
}

func (b *EventBroker) Subscribe(ctx context.Context) (<-chan Event, string) {
	id := uuid.New().String()
	ch := make(chan Event, 16)

	b.mu.Lock()
	b.subscribers[id] = ch
	b.mu.Unlock()

	go func() {
		<-ctx.Done()
		b.mu.Lock()
		delete(b.subscribers, id)
		close(ch)
		b.mu.Unlock()
	}()

	return ch, id
}

func (b *EventBroker) Publish(eventType, data string) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, ch := range b.subscribers {
		select {
		case ch <- Event{Type: eventType, Data: data}:
		default:
		}
	}
}
