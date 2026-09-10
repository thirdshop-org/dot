export type ApiMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export type ApiData<T> = {
  data: T;
  meta?: ApiMeta;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type FileDto = {
  id: string;
  name: string;
  size: number;
  mimeType?: string | null;
  folderId?: string | null;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type FolderDto = {
  id: string;
  name: string;
  parentId?: string | null;
};

export type OcrJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type OcrJob = {
  id: string;
  status: OcrJobStatus;
  text?: string | null;
  error?: string | null;
};

export type DeviceRegistration = {
  deviceId: string;
};

export type User = {
  id: string;
  username: string;
  is_admin: boolean;
};

export type LoginRequest = {
  username: string;
  password: string;
  device_id: string;
};

export type LoginResponse = {
  token: string;
  expires_at: number;
  user: User;
};

export type ResolvedUser = {
  id: string;
  username: string;
};

export type ListParams = {
  page?: number;
  pageSize?: number;
  sort?: string;
};

export type ListFilesParams = ListParams & {
  folderId?: string | null;
};

// Miroir de docs/api-v1.md §6.1 — une entrée d'outbox côté serveur.
// `operation_id` = `pending_operations.id` local (INTEGER).
export type SyncOperation = {
  operation_id: number;
  ref_type?: 'resource' | 'share' | 'share_link' | null;
  ref_id?: number | null;
  resource_id: string;
  resource_type: 'folder' | 'file';
  operation: string;
  payload: Record<string, unknown>;
};

// `applied` est un INDEX, pas un compte : nombre d'ops commitées depuis le
// début du batch.
//   - succès           → applied == operations.length, failed == null
//   - échec            → applied == index de l'op refusée (< length),
//                        failed = cette op ; reprise à operations.slice(applied)
//   - applied == 0     → rien de commité (1re op refusée, `failed` non-null, ou
//                        batch vide) : tout est à rejouer, aucun compteur à
//                        incrémenter côté client.
// Invariant serveur : jamais applied == length avec failed non-null.
export type SyncResult = {
  applied: number;
  failed: { operation_id: number; code: string; message: string } | null;
};

// Miroir de docs/api-v1.md §6.2 — consommé tel quel par `saveResourcePermission`.
export type ResourcePermission = {
  resource_id: string;
  resourceType: 'folder' | 'file';
  effectiveAccess: 'viewer' | 'commenter' | 'editor' | 'owner';
  inherit: boolean;
  ownerId: string | null;
  sharedById: string | null;
  expiresAt: number | null;
  cachedAt: number;
  updatedAt: number;
};