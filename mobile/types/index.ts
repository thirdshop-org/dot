export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  ocrText?: string;
  tags: Tag[];
  url?: string;
}

export interface Tag {
  id: string;
  name: string;
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
