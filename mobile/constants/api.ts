export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080/api/v1';

export const ENDPOINTS = {
  FILES: '/files',
  UPLOAD: '/files/upload',
  SEARCH: '/files/search',
  OCR_JOBS: '/ocr/jobs',
  HEALTH: '/health',
} as const;
