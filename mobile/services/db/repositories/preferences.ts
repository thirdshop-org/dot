import { getDatabase } from '../client';
import { DEVICE_USER_ID_KEY, PREFERENCES_KEY } from '../schema';
import type { UserPreferences } from '../types';

const DEFAULT_PREFERENCES: UserPreferences = {
  syncMode: 'full',
};

export async function getDeviceUserId(): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    DEVICE_USER_ID_KEY,
  );
  if (row) return row.value;

  await db.runAsync(
    `INSERT OR IGNORE INTO user_preferences ("key", "value", updated_at)
     VALUES (?, lower(hex(randomblob(16))), ?)`,
    DEVICE_USER_ID_KEY,
    Date.now(),
  );
  const seeded = await db.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    DEVICE_USER_ID_KEY,
  );
  return seeded!.value;
}

export async function saveUserPreferences(preferences: UserPreferences): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO user_preferences ("key", "value", updated_at) VALUES (?, ?, ?)
     ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", updated_at = excluded.updated_at`,
    PREFERENCES_KEY,
    JSON.stringify(preferences),
    Date.now(),
  );
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    PREFERENCES_KEY,
  );
  if (!row) return DEFAULT_PREFERENCES;

  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.value) } satisfies UserPreferences;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}