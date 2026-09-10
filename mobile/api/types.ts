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
  token: string;
};

export type ListParams = {
  page?: number;
  pageSize?: number;
  sort?: string;
};

export type ListFilesParams = ListParams & {
  folderId?: string | null;
};