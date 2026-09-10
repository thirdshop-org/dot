import { getSession } from './session';

export async function newResourceId(): Promise<string> {
  const db = await getSession();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT lower(hex(randomblob(16))) AS id',
  );
  return row!.id;
}