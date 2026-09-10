import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrations';
import { DATABASE_NAME } from './schema';

let database: SQLiteDatabase | null = null;
let opening: Promise<SQLiteDatabase> | null = null;

async function loadSqlite(): Promise<typeof import('expo-sqlite')> {
  return import('expo-sqlite');
}

/**
 * expo-sqlite (Android, encore non corrigé en 57.x, cf. expo/expo#48999) peut
 * « empoisonner » une connexion : après un teardown de runtime (reload dev,
 * reconstitution d'Activity) de vieux handles natifs sont double-fermés et
 * chaque requête suivante rejette un NullPointerException nu. Un simple reopen
 * renvoie l'objet empoisonné en cache ; seul un reconnect (useNewConnection)
 * redonne une connexion vive.
 */
export function isBrokenConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("NativeDatabase.prepareAsync") ||
    error.message.includes("NativeDatabase.execAsync") ||
    error.message.includes("NullPointerException")
  );
}

async function openDatabase(useNewConnection: boolean): Promise<SQLiteDatabase> {
  const SQLite = await loadSqlite();
  const db = await SQLite.openDatabaseAsync(
    DATABASE_NAME,
    useNewConnection ? { useNewConnection: true } : {},
  );
  await migrateDatabase(db);
  return db;
}

export function getDatabase(): Promise<SQLiteDatabase> {
  if (database) return Promise.resolve(database);
  if (!opening) {
    opening = openDatabase(false)
      .then((db) => {
        database = db;
        return db;
      })
      .finally(() => {
        opening = null;
      });
  }
  return opening;
}

export async function recoverDatabase(): Promise<SQLiteDatabase> {
  const poisoned = database;
  database = null;
  opening = null;
  if (poisoned) {
    try {
      await poisoned.closeAsync();
    } catch {
      // Handle déjà corrompu : se contenter de le lâcher, le reconnect suffit.
    }
  }
  const fresh = await openDatabase(true);
  database = fresh;
  return fresh;
}

export type DatabaseRetryDeps = {
  get(): Promise<SQLiteDatabase>;
  recover(): Promise<SQLiteDatabase>;
};

const defaultRetryDeps: DatabaseRetryDeps = {
  get: getDatabase,
  recover: recoverDatabase,
};

export async function withDatabaseRetry<T>(
  run: (db: SQLiteDatabase) => Promise<T>,
  deps: DatabaseRetryDeps = defaultRetryDeps,
): Promise<T> {
  try {
    const db = await deps.get();
    return await run(db);
  } catch (error) {
    if (!isBrokenConnectionError(error)) throw error;
    const fresh = await deps.recover();
    return await run(fresh);
  }
}

export async function closeDatabase(): Promise<void> {
  if (!database) return;
  await database.closeAsync();
  database = null;
  opening = null;
}

export async function withTransaction<T>(
  work: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  return withDatabaseRetry(async (db) => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await work(db);
    });
    return result;
  });
}