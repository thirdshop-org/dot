import type { FileEntry, Folder } from '../safDirectory.types';

export type { FileEntry, Folder } from '../safDirectory.types';

export type SyncStatus = 'local' | 'cloud' | 'local-cloud';

export type AccessLevel = 'owner' | 'editor' | 'commenter' | 'viewer';

export type ResourceType = 'folder' | 'file';

export type RecipientType = 'user' | 'group';

export type PushStatus = 'pending' | 'synced' | 'failed';

export type UserPreferences = {
  syncMode: 'full' | 'manual' | 'none';
};

export type FolderRow = {
  id: number;
  resource_id: string;
  uri: string | null;
  name: string;
  exists: number | null;
  parent_resource_id: string | null;
  owner_id: string;
  sync_status: SyncStatus;
  added_at: number;
  updated_at: number;
};

export type FileRow = {
  id: number;
  resource_id: string;
  uri: string | null;
  name: string;
  folder_resource_id: string;
  extension: string | null;
  size: number;
  type: string | null;
  exists: number;
  last_modified: number | null;
  owner_id: string;
  sync_status: SyncStatus;
  added_at: number;
  updated_at: number;
};

export type StoredFolder = {
  resource_id: string;
  uri: string | null;
  name: string;
  exists: boolean;
  parent_resource_id: string | null;
  owner_id: string;
  syncStatus: SyncStatus;
  addedAt: number;
  updatedAt: number;
};

export type StoredFile = {
  resource_id: string;
  uri: string | null;
  name: string;
  folder_resource_id: string;
  extension: string;
  exists: boolean;
  size: number;
  type: string;
  lastModified: number | null;
  owner_id: string;
  syncStatus: SyncStatus;
  addedAt: number;
  updatedAt: number;
};

export type ResourcePermissionRow = {
  id: number;
  resource_id: string;
  resource_type: ResourceType;
  effective_access: AccessLevel;
  inherit: number;
  owner_id: string | null;
  shared_by_id: string | null;
  expires_at: number | null;
  cached_at: number;
  updated_at: number;
};

export type ResourcePermission = {
  resource_id: string;
  resourceType: ResourceType;
  effectiveAccess: AccessLevel;
  inherit: boolean;
  ownerId: string | null;
  sharedById: string | null;
  expiresAt: number | null;
  cachedAt: number;
  updatedAt: number;
};

export type NewResourcePermission = {
  resource_id: string;
  resourceType: ResourceType;
  effectiveAccess: AccessLevel;
  inherit?: boolean;
  ownerId?: string | null;
  sharedById?: string | null;
  expiresAt?: number | null;
};

export type ShareRow = {
  id: number;
  resource_id: string;
  resource_type: ResourceType;
  recipient_type: RecipientType;
  recipient_id: string;
  relation: AccessLevel;
  inherit: number;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
};

export type Share = {
  id: number;
  resourceId: string;
  resourceType: ResourceType;
  recipientType: RecipientType;
  recipientId: string;
  relation: AccessLevel;
  inherit: boolean;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  pushStatus: PushStatus;
};

export type NewShare = {
  resourceId: string;
  resourceType: ResourceType;
  recipientType: RecipientType;
  recipientId: string;
  relation: AccessLevel;
  inherit?: boolean;
  expiresAt?: number | null;
};

export type RecipientRow = {
  id: number;
  recipient_type: RecipientType;
  recipient_id: string;
  display_name: string;
  is_active: number;
  updated_at: number;
};

export type Recipient = {
  recipientType: RecipientType;
  recipientId: string;
  displayName: string;
  isActive: boolean;
  updatedAt: number;
};

export type ShareLinkRow = {
  id: number;
  token: string;
  resource_id: string;
  resource_type: ResourceType;
  has_password: number;
  allow_download: number;
  expires_at: number | null;
  max_downloads: number | null;
  downloads_count: number;
  is_revoked: number;
  created_at: number;
  updated_at: number;
};

export type ShareLink = {
  id: number;
  token: string;
  resourceId: string;
  resourceType: ResourceType;
  hasPassword: boolean;
  allowDownload: boolean;
  expiresAt: number | null;
  maxDownloads: number | null;
  downloadsCount: number;
  isRevoked: boolean;
  createdAt: number;
  updatedAt: number;
  pushStatus: PushStatus;
};

export type NewShareLink = {
  token?: string;
  resourceId: string;
  resourceType: ResourceType;
  hasPassword?: boolean;
  allowDownload?: boolean;
  expiresAt?: number | null;
  maxDownloads?: number | null;
};

export type PendingOperationStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PendingOperationType =
  | 'create_resource'
  | 'update_metadata'
  | 'delete_resource'
  | 'move_resource'
  | 'share'
  | 'revoke_share'
  | 'update_share'
  | 'create_link'
  | 'revoke_link';

export type PendingOperationRefType = 'resource' | 'share' | 'share_link';

export type PendingOperationRow = {
  id: number;
  resource_id: string | null;
  resource_type: ResourceType | null;
  ref_type: PendingOperationRefType | null;
  ref_id: number | null;
  operation: PendingOperationType;
  payload: string;
  status: PendingOperationStatus;
  attempts: number;
  error: string | null;
  created_at: number;
  next_retry_at: number | null;
  last_error_at: number | null;
};

export type PendingOperation = {
  id: number;
  resourceId: string | null;
  resourceType: ResourceType | null;
  refType: PendingOperationRefType | null;
  refId: number | null;
  operation: PendingOperationType;
  payload: unknown;
  status: PendingOperationStatus;
  attempts: number;
  error: string | null;
  createdAt: number;
  nextRetryAt: number | null;
  lastErrorAt: number | null;
};

export type NewPendingOperation = {
  resourceId?: string | null;
  resourceType?: ResourceType | null;
  refType?: PendingOperationRefType | null;
  refId?: number | null;
  operation: PendingOperationType;
  payload?: unknown;
};