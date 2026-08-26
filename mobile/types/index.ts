export interface Variant {
  id: string;
  pageNumber: number;
  variantType: string;
  width: number;
  height: number;
  url: string;
  mimeType: string;
}

export interface UnifiedFileItem {
  id: string;
  backendResourceId?: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt?: string;
  source: 'cloud' | 'local' | 'synced';
  syncStatus: SyncStatus;
  localUri?: string;
  ocrText?: string;
  tags: Tag[];
  isFolder: boolean;
  parentResourceId?: string;
  ownerId?: string;
  url?: string;
  thumbnailUrl?: string;
  variants?: Variant[];
  isDeviceFile?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadStatus?: 'pending' | 'uploading' | 'done' | 'error';
}

export type FileItem = UnifiedFileItem;

export function isFolder(file: UnifiedFileItem | { isFolder: boolean }): boolean {
  return file.isFolder;
}

export interface Tag {
  id: string;
  tag_name: string;
}

export interface OcrJob {
  id: string;
  fileId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    total: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export class UploadError extends HttpError {
  fileName: string;

  constructor(fileName: string, status: number, message: string, code?: string) {
    super(status, message, code);
    this.name = 'UploadError';
    this.fileName = fileName;
  }
}

export type CapturedPhoto = {
  id: string;
  filePath: string;
  uri: string;
  uploadedId?: string;
  uploadedAt?: string;
};

export type Batch = {
  id: string;
  name: string;
  createdAt: string;
  photos: CapturedPhoto[];
  tags: string[];
};

export interface User {
  id: string;
  username: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export type SseEvent = {
  event: string;
  data: string;
};

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'cloud' | 'conflict';

export interface Device {
  id: string;
  device_name: string;
  role: string;
}

export interface SyncQueueItem {
  id: string;
  resourceId: string;
  storageLocationId: string;
  operation: string;
  status: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShareEntry {
  user_id: string;
  role: string;
}

export interface ResourcePlacement {
  id: string;
  resourceId: string;
  storageLocationId: string;
  status: string;
  storageKey: string | null;
  syncedAt: string | null;
}

export type PendingActionType = 'tag_add' | 'delete' | 'move' | 'create_folder';
export type PendingActionStatus = 'pending' | 'done' | 'error' | 'obsolete';

export interface PendingAction {
  id: string;
  type: PendingActionType;
  payload: Record<string, unknown>;
  status: PendingActionStatus;
  attempts: number;
  lastError: string | null;
  resourceId: string | null;
  createdAt: string;
}
