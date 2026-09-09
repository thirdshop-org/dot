import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrations';
import { DATABASE_NAME } from './schema';

let database: SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (database) return database;

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrateDatabase(db);
  database = db;
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (!database) return;
  await database.closeAsync();
  database = null;
}

export async function withTransaction<T>(
  work: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  let result!: T;
  await db.withTransactionAsync(async () => {
    result = await work(db);
  });
  return result;
}