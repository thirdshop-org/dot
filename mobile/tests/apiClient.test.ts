import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, setAuthToken, setUnauthorizedHandler, ApiError } from '../api/client';
import type { ApiData } from '../api/types';

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function ok(data: unknown, meta?: unknown): Response {
  return jsonResponse(200, { data, ...(meta !== undefined ? { meta } : {}) });
}

let calls: { url: string; init: RequestInit }[] = [];
const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init: RequestInit) => Promise<Response> | Response): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  };
}

// URL absolue → chemin + query seulement (le prefix est EXPO_PUBLIC_API_BASE_URL)
function pathOf(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

beforeEach(() => {
  calls = [];
  setAuthToken(null);
  setUnauthorizedHandler(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setUnauthorizedHandler(null);
});

test('nominal : GET /health', async () => {
  stubFetch(() => ok({ status: 'healthy' }));
  const res = await api.health();
  assert.equal(pathOf(calls[0].url), '/api/v1/health');
  assert.equal(calls[0].init.method ?? 'GET', 'GET');
  assert.deepEqual(res.data, { status: 'healthy' });
});

test('nominal : POST /devices (register) — plus aucun token, device-only', async () => {
  stubFetch(() => ok({ deviceId: 'aaaa' }));
  const res = await api.registerDevice('aaaa');
  assert.equal(pathOf(calls[0].url), '/api/v1/devices');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { deviceId: 'aaaa' });
  assert.deepEqual(res.data, { deviceId: 'aaaa' });
  assert.ok(!('token' in res.data), 'POST /devices ne doit plus émettre de token');
});

test('nominal : POST /auth/login (seule porte de token)', async () => {
  stubFetch(() =>
    ok({
      token: 'v4.local.xyz',
      expires_at: 1700000000000,
      user: { id: 'u-1', username: 'alice', is_admin: false },
    }),
  );
  const res = await api.login('alice', 'secret-pass', 'dev-1');
  assert.equal(pathOf(calls[0].url), '/api/v1/auth/login');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    username: 'alice',
    password: 'secret-pass',
    device_id: 'dev-1',
  });
  assert.equal(res.data.user.id, 'u-1');
  assert.equal(res.data.user.is_admin, false);
});

test('auth : 401 de login ne déclenche PAS le handler de purge de session', async () => {
  let purged = 0;
  setUnauthorizedHandler(() => {
    purged++;
  });
  stubFetch(() => jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'invalid credentials' } }));
  await assert.rejects(() => api.login('bob', 'wrong', 'dev-1'), (err: unknown) => (err as ApiError).code === 'UNAUTHORIZED');
  assert.equal(purged, 0, 'mauvais identifiants ≠ session à purger');
});

test('auth : 401 d’un endpoint protégé déclenche le handler de purge', async () => {
  let purged = 0;
  setUnauthorizedHandler(() => {
    purged++;
  });
  setAuthToken('tok-expired');
  stubFetch(() => jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'token invalid' } }));
  await assert.rejects(() => api.listFiles(), (err: unknown) => (err as ApiError).code === 'UNAUTHORIZED');
  assert.equal(purged, 1, 'token révoqué → purge de session');
  setUnauthorizedHandler(null);
});

test('nominal : PATCH /users/me/password', async () => {
  stubFetch(() => ok({ id: 'u-1' }));
  await api.changePassword('old-pass', 'new-pass-8chars');
  assert.equal(pathOf(calls[0].url), '/api/v1/users/me/password');
  assert.equal(calls[0].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    current_password: 'old-pass',
    new_password: 'new-pass-8chars',
  });
});

test('nominal : GET /users/resolve?username= (résolution exacte)', async () => {
  stubFetch(() => ok({ id: 'u-9', username: 'bob' }));
  const res = await api.resolveUser('BOB');
  assert.equal(pathOf(calls[0].url), '/api/v1/users/resolve?username=BOB');
  assert.equal(res.data.username, 'bob');
});

test('nominal : GET /files — query filtrée (undefined/null ignorés)', async () => {
  stubFetch(() => ok([], { page: 1, pageSize: 50, total: 0 }));
  const res = await api.listFiles({ folderId: 'abc', page: 2, pageSize: 50, sort: undefined });
  assert.equal(pathOf(calls[0].url), '/api/v1/files?folderId=abc&page=2&pageSize=50');
  assert.equal(calls[0].init.method ?? 'GET', 'GET');
  assert.deepEqual(res.data, []);
  assert.equal(res.meta?.total, 0);
});

test('nominal : GET/DELETE /files/:id — id encodé', async () => {
  stubFetch(() => ok({ id: 'a%2Fb' }));
  await api.getFile('a/b');
  await api.deleteFile('a/b');
  assert.equal(pathOf(calls[0].url), '/api/v1/files/a%2Fb');
  assert.equal(pathOf(calls[1].url), '/api/v1/files/a%2Fb');
  assert.equal(calls[1].init.method, 'DELETE');
});

test('nominal : GET /files/search?q=', async () => {
  stubFetch(() => ok([]));
  await api.searchFiles('rapport', { page: 1 });
  assert.equal(pathOf(calls[0].url), '/api/v1/files/search?q=rapport&page=1');
});

test('nominal : GET /files/folders', async () => {
  stubFetch(() => ok([{ id: 'f', name: 'Docs' }]));
  const res = await api.listFolders();
  assert.equal(pathOf(calls[0].url), '/api/v1/files/folders');
  assert.equal(res.data[0].name, 'Docs');
});

test('nominal : POST /files/upload — multipart FormData, pas de Content-Type manuel', async () => {
  stubFetch(() => ok({ id: 'u', name: 'a.txt', size: 3 }));
  await api.uploadFile({ uri: 'file:///a.txt', name: 'a.txt', mimeType: 'text/plain' }, 'folder1');
  assert.equal(pathOf(calls[0].url), '/api/v1/files/upload');
  assert.equal(calls[0].init.method, 'POST');
  const form = calls[0].init.body as FormData;
  assert.ok(form instanceof FormData);
  // RN transforme le pseudo-objet {uri,name,type} en part de fichier ; sous
  // Node la célébration est stringifiée — on vérifie juste la présence.
  assert.notEqual(form.get('file'), null, 'la part "file" doit être présente');
  assert.equal(form.get('folderId'), 'folder1');
  assert.equal(calls[0].init.headers, undefined, 'le client ne doit jamais fixer Content-Type');
});

test('nominal : OCR create + get', async () => {
  stubFetch(() => ok({ id: 'j', status: 'queued' }));
  const created = await api.createOcrJob('file-1');
  assert.equal(pathOf(calls[0].url), '/api/v1/ocr/jobs');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { fileId: 'file-1' });
  await api.getOcrJob('j');
  assert.equal(pathOf(calls[1].url), '/api/v1/ocr/jobs/j');
  assert.equal(created.data.status, 'queued');
});

test('enveloppe : { data, meta } parsée intégralement', async () => {
  stubFetch(() => ok({ id: 'x', name: 'n' }, { page: 1, pageSize: 10, total: 3 }));
  const res: ApiData<{ id: string }> = await api.getFile('x');
  assert.deepEqual(res, { data: { id: 'x', name: 'n' }, meta: { page: 1, pageSize: 10, total: 3 } });
});

test('hostile : 200 + HTML (proxy) → INVALID_RESPONSE', async () => {
  stubFetch(() => new Response('<html>Bad Gateway</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(() => api.health(), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal((err as ApiError).code, 'INVALID_RESPONSE');
    return true;
  });
});

test('hostile : 200 + corps vide → INVALID_RESPONSE', async () => {
  stubFetch(() => new Response(null, { status: 200 }));
  await assert.rejects(() => api.health(), (err: unknown) => (err as ApiError).code === 'INVALID_RESPONSE');
});

test('hostile : 200 + JSON sans clé data → INVALID_RESPONSE', async () => {
  stubFetch(() => jsonResponse(200, { foo: 1 }));
  await assert.rejects(() => api.health(), (err: unknown) => (err as ApiError).code === 'INVALID_RESPONSE');
});

test('hostile : 200 + enveloppe {error} → INVALID_RESPONSE', async () => {
  stubFetch(() => jsonResponse(200, { error: { code: 'X', message: 'm' } }));
  await assert.rejects(() => api.health(), (err: unknown) => (err as ApiError).code === 'INVALID_RESPONSE');
});

test('liste brute : 200 + [] → data tolérée', async () => {
  stubFetch(() => jsonResponse(200, []));
  const res = await api.listFolders();
  assert.deepEqual(res, { data: [] });
});

test('erreur enveloppée : 400 {error.code} → code transmis', async () => {
  stubFetch(() => jsonResponse(400, { error: { code: 'INVALID_DEVICE_ID', message: 'bad' } }));
  await assert.rejects(() => api.registerDevice('zz'), (err: unknown) => {
    const e = err as ApiError;
    return e.code === 'INVALID_DEVICE_ID' && e.message === 'bad';
  });
});

test('erreur nue : 502 HTML → HTTP_502', async () => {
  stubFetch(() => new Response('<html>502</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(() => api.health(), (err: unknown) => (err as ApiError).code === 'HTTP_502');
});

test('réseau : fetch rejette (dont timeout/AbortError) → NETWORK_ERROR', async () => {
  stubFetch(() => {
    throw new DOMException('The operation was aborted.', 'AbortError');
  });
  await assert.rejects(() => api.health(), (err: unknown) => (err as ApiError).code === 'NETWORK_ERROR');
});

test('auth : sans token, pas de header Authorization', async () => {
  stubFetch(() => ok([]));
  await api.listFiles();
  assert.equal(calls[0].init.headers, undefined);
});

test('auth : token posé → Authorization: Bearer', async () => {
  setAuthToken('tok-123');
  stubFetch(() => ok([]));
  await api.listFiles();
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer tok-123');
});

test('auth : fusion avec Content-Type existant (POST /devices + token)', async () => {
  setAuthToken('tok-123');
  stubFetch(() => ok({ deviceId: 'a' }));
  await api.registerDevice('a');
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer tok-123');
  assert.equal(headers.get('Content-Type'), 'application/json');
});