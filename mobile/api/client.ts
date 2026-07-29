import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { ApiError, HttpError } from '../types';
import { tokenStorage } from './secureStorage';

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 && !isRetry) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.request<T>(endpoint, options, true);
      }
      throw new HttpError(401, 'Session expirée', 'UNAUTHORIZED');
    }

    if (!response.ok) {
      let message = 'Request failed';
      let code: string | undefined;
      try {
        const body: ApiError = await response.json();
        message = body.error?.message || message;
        code = body.error?.code;
      } catch {}
      throw new HttpError(response.status, message, code);
    }

    return response.json();
  }

  private async tryRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) return false;

      const url = `${this.baseUrl}${ENDPOINTS.AUTH_REFRESH}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        await this.clearAuth();
        return false;
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      await tokenStorage.setAccessToken(data.access_token);
      await tokenStorage.setRefreshToken(data.refresh_token);
      return true;
    } catch {
      await this.clearAuth();
      return false;
    }
  }

  private async clearAuth() {
    this.accessToken = null;
    await tokenStorage.deleteAccessToken();
    await tokenStorage.deleteRefreshToken();
    await tokenStorage.deleteUser();
  }

  async subscribeEvents(
    onEvent: (event: string, data: string) => void,
    onError: (err: Error) => void,
  ): Promise<() => void> {
    const abortController = new AbortController();

    const connect = async () => {
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };
        if (this.accessToken) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const response = await fetch(`${this.baseUrl}${ENDPOINTS.EVENTS}`, {
          headers,
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Streaming not supported');

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        while (!abortController.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
            } else if (line.startsWith('data: ')) {
              if (currentEvent) {
                onEvent(currentEvent, line.slice(6));
                currentEvent = '';
              }
            }
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };

    connect();

    return () => abortController.abort();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
