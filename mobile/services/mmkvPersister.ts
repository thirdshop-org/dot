import { createMMKV } from 'react-native-mmkv';
import { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const storage = createMMKV({ id: 'vaultdrop-query-cache' });

export function createMMKVPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      storage.set('query-cache', JSON.stringify(client));
    },
    restoreClient: async () => {
      const raw = storage.getString('query-cache');
      if (!raw) return undefined;
      return JSON.parse(raw) as PersistedClient;
    },
    removeClient: async () => {
      storage.remove('query-cache');
    },
  };
}
