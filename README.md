# VaultDrop

VaultDrop est un coffre-fort de documents personnel, local-first. Le client Android镜映 le SAF dans une base Room et pousse les métadonnées de ses mutations via un outbox transactionnel vers le serveur Go/PostgreSQL — pas d'upload physique, pas de cloud-dépendance.

Disponible sur [thirdshop.fr](https://thirdshop.fr/en/applications/vault/)

## Setup

```bash
# Backend (Go + PostgreSQL)
mise up_backend

# Frontend (Android, build debug APK)
mise up_mobile          # émulateur par défaut
mise up_mobile device   # sur un appareil connecté

# Tests
cd backend && go test ./...
cd mobile-kotlin && ./gradlew :app:testDebugUnitTest
```

## Où regarder

| Zone | Fichiers clés |
|------|---------------|
| API contract | `docs/api-v1.md` — contrat HTTP autoritatif |
| Backend entry | `backend/cmd/server/main.go` — wiring gin + routes |
| Sync outbox | `mobile-kotlin/.../features/sync/OutboxSyncWorker.kt` — worker WorkManager → `POST /sync/ops` |
| SAF scan | `mobile-kotlin/.../features/sync/DeviceSync.kt` — two-pass walk SAF ↔ Room |
| Room DB | `mobile-kotlin/.../data/local/AppDatabase.kt` — version 7, migrations, DAO |
| API Retrofit | `mobile-kotlin/.../data/remote/ApiService.kt` — interface Retrofit (contrat client) |
