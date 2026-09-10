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

- **Device-first** : le device s'enregistre (`POST /devices`) avec son identité **générée localement** (`device_user_id` 32-hex mobile) et reçoit en échange un token **paseto** v4-local qu'il stocke. Requêtes suivantes : `Authorization: Bearer <token>` (toutes les routes **sauf `/health`**), résolu en `device_id` par middleware. V1 : pas de comptes utilisateurs (`users.user_id` reste NULL sur `devices`).
- Au register, le device est **upserté** dans `devices` (`last_seen_at` rafraîchi) ; chaque nouvelle requête avec token est l'occasion de rafraîchir `last_seen_at`. Une ressource ne peut être créée que par un device enregistré (`resources.owner_id` → `devices.device_id`, FK).
- **Identifiants** : `resource_id`, `device_user_id`, `token` de share-link = **TEXT opaque 32-hex minuscule**, `^[0-9a-f]{32}$`. Le mobile génère toujours `lower(hex(randomblob(16)))` ; le serveur stocke **tel quel**, sans conversion UUID (cf. note V2.md). Contrainte serveur : `CHECK (col ~ '^[0-9a-f]{32}$')` sur toutes les colonnes id + FK.
- Horodatages échangés en **millisecondes epoch** (le mobile utilise `Date.now()`).

## 3. Endpoints

| Méthode | Path | Requête | Réponse `data` | Statut absence |
|---|---|---|---|---|
| GET | `/health` | — | `{ "status": "healthy" }` | — |
| POST | `/devices` | `{ "deviceId": "…32-hex" }` (client-generated) | `{ "deviceId": "…32-hex", "token": "v4.local…" }` | `INVALID_DEVICE_ID` |
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
- Le fichier physique est stocké sous `UPLOAD_DIR/<device_id>/<resource_id>.<ext>` ; la métadonnée est persistée en base et renvoyée en `FileDto`. Si la persistance de la métadonnée échoue (ex. `NAME_CONFLICT`), le fichier physique est supprimé.

## 5. OCR

- `POST /ocr/jobs { fileId }` → `OcrJob` immédiat (`status: queued`), traitement **asynchrone** (goroutine par job côté serveur, V1).
- `GET /ocr/jobs/:id` → statut. Le mobile **poll toutes les 3s** jusqu'à `done`/`failed` (`hooks/useUpload.ts`). Cycle : `queued → processing → done | failed` ; `done` renvoie `text`, `failed` renvoie `error`.
- Moteur : **Tesseract en appel système** (`ocr/tesseract.go`), langue `OCR_LANG` (défaut `fra+eng`). Les images sont passées directement à `tesseract` ; les **PDF** subissent une extraction du calque texte (`ledongthuc/pdf`, déjà en go.mod) — un PDF scanné produit un texte vide plutôt qu'un rendu/OCR (hors scope V1).
- `fileId` inconnu/pas du device → `NOT_FOUND`. Fichier physique introuvable (ex. suppression manuelle sous `UPLOAD_DIR`) → job `failed` `"file not readable"`.

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
- **Idempotence** : contrainte d'unicité serveur `(device_id, operation_id)`. Pour chaque op : si déjà traitée → **no-op** (comptée comme appliquée, les doublons arrivent à cause du backoff/retry). Sinon appliquée si valide.
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

- Renvoie le delta (ou l'ensemble) des permissions effectives pour le device appelant, chacune sous la forme exacte consommée par `canAccess` :

```ts
type ResourcePermission = {
  resource_id: string;            // 32-hex
  resourceType: 'folder' | 'file';
  effectiveAccess: 'viewer' | 'commenter' | 'editor' | 'owner';
  inherit: boolean;
  ownerId: string | null;         // device ownership si applicable
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
  4. `owner_id` == device appelant → `owner` (fallback, quel que soit le niveau remonté).
  5. Le **rang le plus élevé** l'emporte ; sans relation applicable et sans ownership → la ressource n'est pas dans le snapshot.
- **TTL / stale** : après `PERMISSION_TTL_MS` (= 24h) sans reseed, `canAccess` **downgrade en lecture seule** (`viewer`) vers le cache.

### 6.3 Placements

- Le statut de placement (`sync_status` mobile : `local` | `cloud` | `local-cloud`) est le reflet du `resource_placements` serveur (statuts V2 : `local_only`, `synced`, `cloud_only`, `pending_upload`, `pending_download`). La matérialisation se fait via l'outbox (`create_resource` → `synced`/`pending_upload` ; suppression physique locale ≠ suppression serveur).

## 7. Codes d'erreur courants

`NOT_FOUND`, `NOT_IMPLEMENTED` (501 temporaire sur les routes non construites — état actuel : **toutes les routes V1 sont réelles** : files CRUD/upload/search, folders, devices, health, sync/ops, sync/permissions, ocr/jobs), `FILE_TOO_LARGE` (413), `NAME_CONFLICT` (409 — même nom dans le même parent, cf. `UNIQUE(parent_id, name)`, **ou à la racine**, index partiel `(owner_id, name) WHERE parent_id IS NULL`), `NETWORK_ERROR` (côté client), `INVALID_RESPONSE` (côté client — 2xx mais corps d'enveloppe invalide), `HTTP_<status>` (fallback). Statut `SERVICE_UNAVAILABLE` (503) si le backend n'est pas initialisé.