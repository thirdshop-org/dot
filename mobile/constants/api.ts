export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.1.17:8080/api/v1';

export const ENDPOINTS = {
  FILES: '/files',
  FILE: '/files',
  UPLOAD: '/files/upload',
  SEARCH: '/files/search',
  OCR_JOBS: '/ocr/jobs',
  HEALTH: '/health',
} as const;
