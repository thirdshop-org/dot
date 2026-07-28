export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.1.17:8080/api/v1';

export const ENDPOINTS = {
  RESOURCES: '/resources',
  RESOURCE: '/resources',
  UPLOAD: '/resources/upload',
  MOVE: '/resources/move',
  FOLDERS: '/resources/folders',
  VARIANT: '/variants',
  DEDUP_CHECK: '/resources/dedup-check',
  OCR_JOBS: '/ocr/jobs',
  HEALTH: '/health',
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_LOGOUT: '/auth/logout',
  DEVICES: '/devices',
  SYNC_PULL: '/sync/pull',
  SYNC_PUSH: '/sync/push',
  SHARE: '/resources/:id/share',
  ACCESS: '/resources/:id/access',
} as const;
