import { getDatabase, withDatabaseRetry } from './client';
import type { SQLiteBindValue } from 'expo-sqlite';

export type DbSession = {
  runAsync(sql: string, ...params: SQLiteBindValue[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: SQLiteBindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SQLiteBindValue[]): Promise<T[]>;
};

let override: DbSession | null = null;

export function __setDbForTests(db: DbSession | null): void {
  override = db;
}

export async function getSession(): Promise<DbSession> {
  if (override) return override;
  await getDatabase();
  return liveSession;
}

const liveSession: DbSession = {
  runAsync: (sql, ...params) =>
    withDatabaseRetry((db) => db.runAsync(sql, ...params)),
  getFirstAsync: (sql, ...params) =>
    withDatabaseRetry((db) => db.getFirstAsync(sql, ...params)),
  getAllAsync: (sql, ...params) =>
    withDatabaseRetry((db) => db.getAllAsync(sql, ...params)),
};