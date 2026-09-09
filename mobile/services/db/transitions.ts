import type { SyncStatus } from './types';

export type SyncEvent =
  | 'created_local'
  | 'uploaded'
  | 'downloaded'
  | 'deleted_cloud';

export type SyncTransitionResult = SyncStatus | 'gone';

export function transitionSyncStatus(
  from: SyncStatus,
  event: SyncEvent,
): SyncTransitionResult {
  switch (from) {
    case 'local':
      switch (event) {
        case 'created_local':
          return 'local';
        case 'uploaded':
          return 'cloud';
        case 'downloaded':
          return 'local-cloud';
        case 'deleted_cloud':
          return 'gone';
      }
    case 'cloud':
      switch (event) {
        case 'created_local':
          return 'local-cloud';
        case 'uploaded':
          return 'cloud';
        case 'downloaded':
          return 'local-cloud';
        case 'deleted_cloud':
          return 'gone';
      }
    case 'local-cloud':
      switch (event) {
        case 'created_local':
        case 'uploaded':
        case 'downloaded':
          return 'local-cloud';
        case 'deleted_cloud':
          return 'local';
      }
  }
}