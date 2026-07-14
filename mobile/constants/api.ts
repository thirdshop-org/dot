export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.1.17:8080/api/v1';

export const ENDPOINTS = {
  FILES: '/files',
  FILE: '/files',
  UPLOAD: '/files/upload',
  SEARCH: '/files/search',
  MOVE: '/files/move',
  FOLDERS: '/files/folders',
  OCR_JOBS: '/ocr/jobs',
  HEALTH: '/health',
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_LOGOUT: '/auth/logout',
} as const;
