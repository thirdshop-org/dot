FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/server ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates curl libreoffice-core poppler-utils

WORKDIR /app

COPY --from=builder /bin/server .
COPY internal/db/migrations ./internal/db/migrations

RUN mkdir -p /app/uploads /app/uploads/thumbnails /data

EXPOSE 8080

CMD ["./server"]
