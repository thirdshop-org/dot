import type {
  ApiData,
  ApiErrorBody,
  DeviceRegistration,
  FileDto,
  FolderDto,
  ListFilesParams,
  OcrJob,
} from './types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1';

export const DEFAULT_TIMEOUT_MS = 15_000;

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function toQuery(params?: QueryParams): string {
  if ( !params ) return '';
  const search = new URLSearchParams();
  for ( const [key, value] of Object.entries(params) ) {
    if ( value === undefined || value === null ) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

function mergeHeaders(init?: HeadersInit): HeadersInit | undefined {
  if ( !authToken ) return init;
  const merged = new Headers(init);
  if ( !merged.has('Authorization') ) {
    merged.set('Authorization', `Bearer ${authToken}`);
  }
  return merged;
}

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ApiData<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: mergeHeaders(init.headers),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', 'Serveur injoignable');
    }

    const body = (await response.json().catch(() => null)) as
      | ApiData<T>
      | ApiErrorBody
      | unknown[]
      | string
      | number
      | null;

    if ( !response.ok ) {
      const error = body != null && isErrorBody(body) ? body.error : null;
      throw new ApiError(
        error?.code ?? `HTTP_${response.status}`,
        error?.message ?? response.statusText
      );
    }

    // 2xx : enveloppe `{ data }` obligatoire. Un corps illisible (HTML d'un
    // proxy, JSON malformé, corps vide) ou un objet sans clé `data` est une
    // réponse invalide → ApiError propre, jamais de TypeError ni de data
    // indéfini silencieux. Les listes brutes (`[]`) restent tolérées.
    if ( body === null || isErrorBody(body) ) {
      throw new ApiError('INVALID_RESPONSE', 'Réponse serveur invalide (enveloppe {data} attendue)');
    }
    if ( !isRecord(body) ) {
      return { data: body as T };
    }
    if ( !('data' in body) ) {
      throw new ApiError('INVALID_RESPONSE', 'Réponse serveur invalide (enveloppe {data} attendue)');
    }
    return body as ApiData<T>;
  } finally {
    clearTimeout(timer);
  }
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    (body as { error?: { code?: unknown } }).error != null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const api = {
  getApiBaseUrl: () => API_BASE_URL,

  health: () => request<{ status: string }>('/health'),

  registerDevice: (deviceId: string) =>
    request<DeviceRegistration>('/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    }),

  listFiles: (params?: ListFilesParams) =>
    request<FileDto[]>(`/files${toQuery(params)}`),

  getFile: (id: string) =>
    request<FileDto>(`/files/${encodeURIComponent(id)}`),

  deleteFile: (id: string) =>
    request<{ id: string }>(`/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  searchFiles: (q: string, params?: QueryParams) =>
    request<FileDto[]>(`/files/search${toQuery({ q, ...params })}`),

  listFolders: () => request<FolderDto[]>('/files/folders'),

  uploadFile: (
    file: { uri: string; name: string; mimeType: string },
    folderId?: string | null
  ) => {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);
    if ( folderId ) form.append('folderId', folderId);
    return request<FileDto>('/files/upload', {
      method: 'POST',
      body: form,
    });
  },

  createOcrJob: (fileId: string) =>
    request<OcrJob>('/ocr/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    }),

  getOcrJob: (id: string) =>
    request<OcrJob>(`/ocr/jobs/${encodeURIComponent(id)}`),
};