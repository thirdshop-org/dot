import { getDatabase } from './client';
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
  return override ?? (await getDatabase());
}