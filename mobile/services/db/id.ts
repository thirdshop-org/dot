import { getDatabase } from './client';

export async function newResourceId(): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT lower(hex(randomblob(16))) AS id',
  );
  return row!.id;
}