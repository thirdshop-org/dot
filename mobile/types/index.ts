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
