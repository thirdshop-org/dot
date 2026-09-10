import { getSession } from '../session';
import { ACTIVE_USER_ID_KEY, AUTH_TOKEN_KEY, DEVICE_USER_ID_KEY, PREFERENCES_KEY } from '../schema';
import type { UserPreferences } from '../types';

const DEFAULT_PREFERENCES: UserPreferences = {
  syncMode: 'full',
};

export async function getDeviceUserId(): Promise<string> {
  const db = await getSession();
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
  const db = await getSession();
  await db.runAsync(
    `INSERT INTO user_preferences ("key", "value", updated_at) VALUES (?, ?, ?)
     ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", updated_at = excluded.updated_at`,
    PREFERENCES_KEY,
    JSON.stringify(preferences),
    Date.now(),
  );
}

export async function getDeviceAuthToken(): Promise<string | null> {
  const db = await getSession();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    AUTH_TOKEN_KEY,
  );
  return row?.value ?? null;
}

export async function saveDeviceAuthToken(token: string): Promise<void> {
  const db = await getSession();
  await db.runAsync(
    `INSERT INTO user_preferences ("key", "value", updated_at) VALUES (?, ?, ?)
     ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", updated_at = excluded.updated_at`,
    AUTH_TOKEN_KEY,
    token,
    Date.now(),
  );
}

// Miroir non-sensible du compte connecté (le token vit en SecureStore). NULL
// = aucun compte actif (mode device-local legacy / tests).
export async function getActiveUserId(): Promise<string | null> {
  const db = await getSession();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT "value" FROM user_preferences WHERE "key" = ?',
    ACTIVE_USER_ID_KEY,
  );
  return row?.value || null;
}

export async function setActiveUserId(userId: string): Promise<void> {
  const db = await getSession();
  await db.runAsync(
    `INSERT INTO user_preferences ("key", "value", updated_at) VALUES (?, ?, ?)
     ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", updated_at = excluded.updated_at`,
    ACTIVE_USER_ID_KEY,
    userId,
    Date.now(),
  );
}

export async function clearActiveUserId(): Promise<void> {
  const db = await getSession();
  await db.runAsync(
    'DELETE FROM user_preferences WHERE "key" = ?',
    ACTIVE_USER_ID_KEY,
  );
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const db = await getSession();
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