# VaultDrop — Application de Gestion de Fichiers V1

## Vision

Application mobile tout-en-un permettant de centraliser, organiser et retrouver ses documents. Upload depuis l'appareil, scan caméra avec OCR, tagging et recherche rapide. Le back-end Go assure le traitement asynchrone (OCR, indexing) et la persistence. Le front React Native reste léger : il affiche, interagit et met en cache.

## Scope V1

On livre un produit fonctionnel utilisable au quotidien, pas un framework. V1 = gestion de fichiers avec scan OCR intégré. Pas de mode collaboratif, pas de plugins, pas de partage avancé.

## Non-Goals (V1)

- Mode collaboratif / multi-utilisateur
- Système de plugins
- Synchronisation offline complexe
- Plateforme de partage publique

---

## Vue d'Ensemble Architecture

```
┌─────────────────────┐       ┌─────────────────────┐
│   React Native App  │ ────> │   API Go Backend    │
│   (Expo managed)    │ HTTPS │   (REST)            │
│   - Upload          │       │   - Upload fichiers │
│   - Caméra / Scan   │       │   - OCR async       │
│   - Tags / Recherche│       │   - Index/search    │
│   - Affichage       │       │   - Persistance     │
└─────────────────────┘       └─────────────────────┘
```

Le mobile ne contient pas de logique métier. Tout traitement lourd (OCR, extraction de texte, indexation) est géré côté back-end.

---

## Fonctionnalités Attendues

### Upload de fichiers
- Sélection depuis la galerie appareil
- Upload par drag-and-drop interne
- Support des formats : PDF, images (JPG, PNG)
- Feedback visuel pendant l'envoi (progress)
- Retry automatique en cas d'échec réseau

### Scan Documents (Caméra)
- Prise de photo depuis l'app
- Recadrage et orientation automatique
- Envoi direct vers le back-end pour OCR
- Retour du texte extrait affiché à l'utilisateur

### Tagging
- Ajout de tags manuels sur chaque fichier
- Suggestion de tags basée sur le contenu OCR
- Filtrage par tag dans la liste

### Recherche
- Recherche full-text sur le contenu OCR
- Recherche par nom de fichier
- Filtres combinés (tag + texte)

### Listing
- Liste des fichiers uploadés avec aperçu
- Tri par date, nom, tag
- Pagination côté serveur

### Partage (Optionnel, Phase Later)
- Génération de lien temporaire
- Pas prioritaire en V1

---

## Exigences UX

- UI claire et épurée, minimaliste
- Temps de réponse < 2s pour les actions principales
- Feedback immédiat sur toutes les interactions
- Pas d'écran de chargement > 3s sans spinner
- Mode offline minimal : liste des fichiers déjà chargée visible même sans réseau

---

## Attentes API REST (Back-end Go)

### Endpoints

| Méthode | Path | Description |
|---|---|---|
| GET | /api/v1/files | Liste des fichiers (pagination) |
| POST | /api/v1/files/upload | Upload d'un fichier |
| GET | /api/v1/files/:id | Détail d'un fichier |
| DELETE | /api/v1/files/:id | Suppression d'un fichier |
| GET | /api/v1/files/search?q= | Recherche full-text |
| POST | /api/v1/files/:id/tags | Ajout de tags |
| GET | /api/v1/files/:id/tags | Tags d'un fichier |
| POST | /api/v1/ocr/jobs | Soumettre un job OCR |
| GET | /api/v1/ocr/jobs/:id | Statut d'un job OCR |
| GET | /api/v1/health | Health check |

### Format de réponse standard

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "total": 42
  }
}
```

### Erreurs

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "Fichier dépasse la limite de 50 Mo"
  }
}
```

---

## Flux de Données

```
[Capture photo] ──> [Upload API] ──> [Back-end stocke]
                                           │
                                           v
                                    [Job OCR créé]
                                           │
                                           v (async)
                                    [Traitement OCR]
                                    [Extraction texte]
                                    [Indexation search]
                                           │
                                           v
[App affiche fichier] <──── [Polling statut] <── [Résultat prêt]
```

1. L'utilisateur prend une photo ou sélectionne un fichier
2. Le fichier est uploadé vers POST /api/v1/files/upload
3. Le back-end crée un job OCR et retourne immédiatement un ID
4. L'app poll GET /api/v1/ocr/jobs/:id ou utilise un webhook
5. Une fois l'OCR terminé, le texte est indexé et le fichier apparaît avec son contenu searchable

---

## Choix Techniques

### Front-end (React Native)
- Expo managed workflow (développement rapide, build plus simple)
- TanStack Query (gestion serveur state, cache, refetch)
- React Navigation (navigation entre écrans)
- react-native-image-picker (sélection + caméra)
- MMKV (stockage clé-valeur pour cache local)

### Back-end (Go)
- Framework HTTP : Gin ou Fiber (au choix implémenteur)
- Persistance : SQLite pour V1 (volumétrie faible attendue)
- OCR : Tesseract en ligne de commande (appel système)
- Search : SQLite FTS5 pour la recherche full-text
- Stockage fichiers : disque local avec chemin référencé en base

---

## Structure de Dossiers Suggérée

### Front-end (React Native / Expo)

```
mobile/
├── app/                    # Expo Router ou navigation
│   ├── index.tsx           # Ecran principal (liste)
│   ├── upload.tsx          # Ecran upload
│   ├── scan.tsx            # Ecran scan caméra
│   └── search.tsx          # Ecran recherche
├── components/
│   ├── FileCard.tsx
│   ├── TagChip.tsx
│   └── UploadProgress.tsx
├── hooks/
│   ├── useFiles.ts         # TanStack Query hooks
│   ├── useSearch.ts
│   └── useUpload.ts
├── api/
│   └── client.ts           # Client API (axios ou fetch)
├── types/
│   └── index.ts            # Types TypeScript
├── constants/
│   └── api.ts              # URLs, clés API
└── package.json
```

### Back-end (Go)

```
backend/
├── cmd/
│   └── server/
│       └── main.go         # Point d'entrée
├── internal/
│   ├── handlers/           # Handlers HTTP
│   ├── models/             # Modèles de données
│   ├── repository/          # Accès données
│   ├── service/            # Logique métier
│   └── ocr/                # Module OCR
├── pkg/
│   └── api/
│       └── response.go     # Helpers réponse
├── uploads/                # Fichiers stockés
├── go.mod
└── go.sum
```

---

## Getting Started

### Prérequis

- Node.js latest lts
- npm ou yarn
- Expo CLI (`npm install -g expo-cli`)
- Go latest lts
- Tesseract OCR installé (`apt install tesseract-ocr` sur Debian/Ubuntu)

### Installation (Front-end)

```bash
cd mobile
npm install
npx expo start
```

### Installation (Back-end)

```bash
cd backend
go mod download
go run cmd/server/main.go
```

### Build APK Android (Expo)

```bash
npx expo run:android --variant release
```

---

## Variables d'Environnement

### Front-end (.env)

```
API_BASE_URL=http://localhost:8080/api/v1
TESSERACT_LANG=fr+eng
```

### Back-end (.env)

```
PORT=8080
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
OCR_LANG=fra+eng
```

---

## Itérations Futures

### V2 — Fiabilité et Performance
- Remplacement SQLite par PostgreSQL
- Upload chunked pour gros fichiers
- Compression d'images côté client

### V3 — Organisation Avancée
- Dossiers virtuels / hiérarchie
- Tags suggérés par IA
- OCR multilingue amélioré

### V4 — Collaboration
- Comptes utilisateurs
- Partage avec lien temporaire
- Rôle et permissions

### V5 — Plateforme
- Système de plugins (event bus)
- API publique
- Extensions tierces

---

## Statut du Projet

Phase : Conception et prototypage
Backend Go : En cours de structuration
Frontend React Native : À initier
