# VaultDrop — Contrat API V1 (autoritatif)

Status : **autoritatif**. Le client mobile est la source de vérité : `mobile/api/types.ts` + `mobile/api/client.ts` sont implémentés et testés ; le serveur Go doit les matcher exactement (méthode + path + enveloppe), il ne re-négocie pas. Document consolidé à partir de ces deux fichiers — toute divergence de ce doc doit être portée dans le client d'abord.

Références : `V2.md` (modèle cible), `mobile/services/db/` (conventions sync), `AGENTS.md` (structure + commandes).

---

## 1. Base et transport

- Base URL serveur : schéma + host configurés côté client via `EXPO_PUBLIC_API_BASE_URL` (défaut `http://localhost:8080/api/v1`).
- JSON partout, sauf `POST /files/upload` (multipart).
- Enveloppe succès : `{ "data": T, "meta"?: { "page": int, "pageSize": int, "total": int } }` (`meta` présent sur les listes paginées).
- Erreur : `{ "error": { "code": string, "message": string } }` + statut HTTP adéquat.
- Côté client, toute réponse non-`2xx` est normalisée en `ApiError` : `code` du body si présent, sinon `HTTP_<status>` ; échec réseau → `NETWORK_ERROR`. Une réponse `2xx` mais dont le body n'est pas du JSON d'enveloppe valide (HTML, corps vide, JSON mal formé, absence de la clé `data`) → `INVALID_RESPONSE` (client-only).

## 2. Identité et identifiants (invariants)

- **User-first (V1 finale)** : le device s'enregistre d'abord (`POST /devices`) avec son identité **générée localement** (`device_user_id` 32-hex mobile) — **réponse `{ "deviceId" }` uniquement, sans token**. Puis le client appelle `POST /auth/login` (`username` + `password` + `device_id`) pour obtenir son token **paseto** v4-local. Requêtes suivantes : `Authorization: Bearer <token>` (toutes les routes **sauf `/health`, `/devices`, `/auth/login`**).
- **Claims du token** : le **subject = `user_id`** (AUTORISE, clé de scoping de toutes les ressources) ; `device_id` est un **claim secondaire, porté mais NON autorisant seul** (idempotence outbox + jobs OCR). Résolu par middleware `RequireAuth` qui vérifie aussi que le compte existe toujours (`deleted_at IS NULL`).
- **TTL : 7 jours, sans refresh.** À expiration, le client re-logine (`POST /auth/login`). Le changement de mot de passe (`PATCH /users/me/password`) **n'invalide pas** les tokens déjà émis — limite V1 assumée (pas de liste de révocation) jusqu'à l'expiration.
- Au login, `devices.user_id` mémorise le **dernier user connecté** (INFORMATIF uniquement, jamais autorisant — recommande `POST /devices` → `POST /auth/login` pour un nouveau device, sans réutiliser le device d'un autre compte).
- **Identifiants** : `resource_id`, `device_user_id`, `user_id`, `is_admin`… = **TEXT opaque 32-hex minuscule**, `^[0-9a-f]{32}$`. Le mobile génère toujours `lower(hex(randomblob(16)))` ; le serveur stocke **tel quel**, sans conversion UUID (cf. note V2.md). Contrainte serveur : `CHECK (col ~ '^[0-9a-f]{32}$')` sur toutes les colonnes id + FK.
- **Usernames** : `username` = forme affichée ; l'unicité et la résolution portent sur `username_normalized` (lowercase + trim). Résolution d'un destinataire : `GET /users/resolve?username=` (exact uniquement, jamais de listing ni de préfixe — pas d'énumération de comptes).
- **Bootstrap** : au premier démarrage, si `users` est vide, `ADMIN_USERNAME`/`ADMIN_PASSWORD` (env) créent le **premier admin** ; absents → le serveur **refuse de démarrer**. L'env n'écrase jamais un compte existant.
- Horodatages échangés en **millisecondes epoch** (le mobile utilise `Date.now()`).

## 3. Endpoints

| Méthode | Path | Requête | Réponse `data` | Statut absence |
|---|---|---|---|---|
| GET | `/health` | — | `{ "status": "healthy" }` | — |
| POST | `/devices` | `{ "deviceId": "…32-hex" }` (client-generated) | `{ "deviceId": "…32-hex" }` — **aucun token** (V1 finale) | `INVALID_DEVICE_ID` |
| POST | `/auth/login` | `{ "username", "password", "device_id" }` | `{ "token", "expires_at" (ms), "user": { "id", "username", "is_admin" } }` | `UNAUTHORIZED` / `INVALID_DEVICE_ID` |
| GET | `/users/resolve` | query `username` (obligatoire) | `{ "id", "username" }` | `NOT_FOUND` |
| PATCH | `/users/me/password` | `{ "current_password", "new_password" }` | `{ "id" }` | `INVALID_PASSWORD` (403) |
| GET | `/files` | query `folderId?`, `page?`, `pageSize?`, `sort?` | `FileDto[]` (+ `meta`) | — |
| GET | `/files/:id` | — | `FileDto` | `NOT_FOUND` |
| DELETE | `/files/:id` | — | `{ "id": "…" }` | `NOT_FOUND` |
| GET | `/files/search` | query `q` (obligatoire), `page?`, `pageSize?` | `FileDto[]` (+ `meta`) | — |
| GET | `/files/folders` | — | `FolderDto[]` (racines) | — |
| POST | `/files/upload` | multipart : `file` (uri/name/type), `folderId?` | `FileDto` | `FILE_TOO_LARGE` |
| POST | `/ocr/jobs` | `{ "fileId": "…" }` | `OcrJob` | — |
| GET | `/ocr/jobs/:id` | — | `OcrJob` | `NOT_FOUND` |
| POST | `/sync/ops` | voir §6 | voir §6 | — |
| GET | `/sync/permissions` | query `after?` (cached_at ms) | `ResourcePermission[]` | — |

### DTOs (copie conforme de `mobile/api/types.ts`)

```ts
type FileDto = {
  id: string;               // resource_id 32-hex
  name: string;
  size: number;
  mimeType?: string | null;
  folderId?: string | null; // resource_id 32-hex
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};
type FolderDto = { id: string; name: string; parentId?: string | null };
type OcrJobStatus = 'queued' | 'processing' | 'done' | 'failed';
type OcrJob = { id: string; status: OcrJobStatus; text?: string | null; error?: string | null };
```

## 4. Upload

- Multipart : champ `file` + `folderId?` optionnel. **Le client ne fixe jamais `Content-Type`** (le boundary doit être généré par la plateforme).
- Limite : `MAX_FILE_SIZE_MB` (défaut 50). Dépassement → 413 `{ "error": { "code": "FILE_TOO_LARGE", … } }`.
- Le fichier physique est stocké sous `UPLOAD_DIR/<user_id>/<resource_id>.<ext>` ; la métadonnée est persistée en base et renvoyée en `FileDto`. Si la persistance de la métadonnée échoue (ex. `NAME_CONFLICT`), le fichier physique est supprimé.

## 5. OCR

- `POST /ocr/jobs { fileId }` → `OcrJob` immédiat (`status: queued`), traitement **asynchrone** (goroutine par job côté serveur, V1).
- `GET /ocr/jobs/:id` → statut. Le mobile **poll toutes les 3s** jusqu'à `done`/`failed` (`hooks/useUpload.ts`). Cycle : `queued → processing → done | failed` ; `done` renvoie `text`, `failed` renvoie `error`.
- Moteur : **Tesseract en appel système** (`ocr/tesseract.go`), langue `OCR_LANG` (défaut `fra+eng`). Les images sont passées directement à `tesseract` ; les **PDF** subissent une extraction du calque texte (`ledongthuc/pdf`, déjà en go.mod) — un PDF scanné produit un texte vide plutôt qu'un rendu/OCR (hors scope V1).
- `fileId` inconnu/pas du user → `NOT_FOUND`. Fichier physique introuvable (ex. suppression manuelle sous `UPLOAD_DIR`) → job `failed` `"file not readable"`. Le job est créé par le device courant (`ocr_jobs.device_id`) mais la validation de la ressource est scopée par le **user**.

## 6. Contrat de sync (outbox + snapshot)

### 6.1 Outbox — `POST /sync/ops`

```json
{
  "operations": [
    {
      "operation_id": 42,          // = id client (pending_operations.id)
      "ref_type": "resource",      // "resource" | "share" | "share_link"
      "ref_id": 7,                 // id local de la ligne share/share_link (sinon null)
      "resource_id": "…32-hex",    // ressource cible
      "resource_type": "folder",   // "folder" | "file"
      "operation": "create_resource",
      "payload": {}
    }
  ]
}
```

- `operation` ∈ `create_resource | update_metadata | delete_resource | move_resource | share | revoke_share | update_share | create_link | revoke_link` (cf. `PendingOperationType` mobile).
- L'idempotence outbox reste **par device** : `UNIQUE(device_id, operation_id)` (la réinscription d'un device avec un login différent ne réutilise pas l'historique outbox d'un autre compte). Pour chaque op : si déjà traitée → **no-op** (comptée comme appliquée, les doublons arrivent à cause du backoff/retry). Sinon appliquée si valide.
- **Ordre** : les opérations sont appliquées **séquentiellement**, dans l'ordre du batch. Le serveur **s'arrête à la première erreur non-idempotente** et renvoie l'index atteint — le client reprend à cet index.
- Réponse : `2xx` avec `{ "applied": int, "failed": { "operation_id": int, "code": string, "message": string } | null }` (`applied` = index de la prochaine op à envoyer).
- Côté client, le `pushStatus` (pending/synced/failed) des shares/share_links est **dérivé** de l'état des opérations de l'outbox ; dead-letter après `MAX_PENDING_ATTEMPTS` (= 5). **Côté serveur, les ops `share | revoke_share | update_share | create_link | revoke_link` sont accusées réception mais ne créent aucun état** (V1 single-owner, pas de table shares serveur) — la dérivation du pushStatus reste purement client.
- Sémantique d'application (côté serveur) :
  - `create_resource` : crée la ressource ; **déjà présente → no-op** (rejeu idempotent). `payload.name` obligatoire.
  - `update_metadata` / `move_resource` : ressource absente → **no-op** (état terminal atteint) ; dossier cible de `move_resource` absent → `NOT_FOUND` ; déplacement dans soi-même → `INVALID_REQUEST`.
  - `delete_resource` : **idempotent** — suppression d'une ressource absente = succès.
  - Validation (deuxième champ `operation_id`, hex32 pour `resource_id`, enum `operation`) → échec `INVALID_REQUEST` avec arrêt du batch.
  - Nom déjà pris (même parent, ou à la racine) → échec `NAME_CONFLICT`.**

### 6.2 Snapshot — `GET /sync/permissions?after=<cached_at_ms>`

- Renvoie le delta (ou l'ensemble) des permissions effectives pour le **user** appelant, chacune sous la forme exacte consommée par `canAccess` :

```ts
type ResourcePermission = {
  resource_id: string;            // 32-hex
  resourceType: 'folder' | 'file';
  effectiveAccess: 'viewer' | 'commenter' | 'editor' | 'owner';
  inherit: boolean;
  ownerId: string | null;         // ownership USER si applicable
  sharedById: string | null;
  expiresAt: number | null;       // ms epoch ; null = jamais
  cachedAt: number;               // ms epoch — horodatage du snapshot (TTL 24h)
  updatedAt: number;
};
```

- **Calcul de `effective_access`** (le serveur est la source de vérité) :
  1. Rang : `viewer = 1 < commenter = 2 < editor = 3 < owner = 4`.
  2. La permission **exacte sur le nœud** est autoritaire (elle n'est pas annulée par son propre `inherit=false`).
  3. Les ancêtres propagent **uniquement si leur relation a `inherit = true`** ; une relation expirée (`expires_at` passé) est ignorée **et ne propage pas**.
  4. `owner_id` == le user appelant → `owner` (fallback, quel que soit le niveau remonté).
  5. Le **rang le plus élevé** l'emporte ; sans relation applicable et sans ownership → la ressource n'est pas dans le snapshot.
- **TTL / stale** : après `PERMISSION_TTL_MS` (= 24h) sans reseed, `canAccess` **downgrade en lecture seule** (`viewer`) vers le cache.

### 6.3 Placements

- Le statut de placement (`sync_status` mobile : `local` | `cloud` | `local-cloud`) est le reflet du `resource_placements` serveur (statuts V2 : `local_only`, `synced`, `cloud_only`, `pending_upload`, `pending_download`). La matérialisation se fait via l'outbox (`create_resource` → `synced`/`pending_upload` ; suppression physique locale ≠ suppression serveur).

## 7. Codes d'erreur courants

- Authentification : `UNAUTHORIZED` (**401** — token manquant/invalide/expiré, compte supprimé, OU identifiants de login erronés : **indistinguables par design**, même code+message), `INVALID_DEVICE_ID` (**400** — device non enregistré au login).
- Ressources : `NOT_FOUND` (404), `NAME_CONFLICT` (409 — même nom dans le même parent, cf. `UNIQUE(parent_id, name)`, **ou à la racine**, index partiel `(user_id, name) WHERE parent_id IS NULL`), `FILE_TOO_LARGE` (413), `INVALID_PASSWORD` (403 sur `PATCH /users/me/password`).
- Client-only : `NETWORK_ERROR`, `INVALID_RESPONSE` (2xx mais corps d'enveloppe invalide), `HTTP_<status>` (fallback). Statut `SERVICE_UNAVAILABLE` (503) si le backend n'est pas initialisé.
- **V1 finale : toutes les routes sont réelles** (pas de 501 restant).

## 8. Moteur de login (règles de sécurité)

- `POST /auth/login` : le **device doit exister** (`POST /devices` d'abord, sinon 400 `INVALID_DEVICE_ID`). La vérification du mot de passe est **constant-time** (`argon2id`, comparaison `subtle`) et le délai est **égalisé** entre « username inconnu » et « mauvais mot de passe » (vérification contre un dummy-hash) — les deux produisent exactement la même réponse 401.
- `GET /users/resolve` : résolution **exacte** du `username_normalized` uniquement ; ne renvoie **jamais** `email` ni `is_admin` (ni listing, ni préfixe → pas d'énumération de comptes).
- `PATCH /users/me/password` : exige `current_password` (mauvais curl → 403). Minimum 8 caractères. **Limite V1** : tokens émis non révoqués (validité 7 j), et `is_admin`/`ADMIN_*` non modifiables par API.