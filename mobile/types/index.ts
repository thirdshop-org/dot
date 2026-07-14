export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  ocrText?: string;
  tags: Tag[];
  isFolder: boolean;
  parentFileId?: string;
  url?: string;
}

export function isFolder(file: FileItem): boolean {
  return file.isFolder;
}

export interface Tag {
  id: string;
  tag_name: string;
  tag_type: string;
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
