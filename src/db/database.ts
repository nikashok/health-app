/**
 * Database bootstrap — NATIVE (iOS/Android), via expo-sqlite.
 *
 * Responsibilities on app launch:
 *  1. Copy the bundled read-only `ifct2017.db` to writable storage — ONCE (a second
 *     launch must not re-copy, which would wipe the user's data).
 *  2. Open the writable copy.
 *  3. Run the shared M0 migration (./migrate), gated by a schema_version row.
 *  4. Probe FTS5; if unavailable, fall back to LIKE search.
 *
 * The browser build uses database.web.ts (sql.js) instead — Metro resolves the right
 * file per platform. Both expose the same getDatabase()/initDatabase()/isFtsAvailable().
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { probeFts, runMigrations, type SqlDb } from './migrate';

const DB_NAME = 'ifct2017.db';

let dbInstance: SqlDb | null = null;
let ftsAvailable = true;

/** True when FTS5 is usable; false means the app must fall back to LIKE search. */
export function isFtsAvailable(): boolean {
  return ftsAvailable;
}

/**
 * Copy the bundled DB into writable storage on first launch only. The existence
 * check is the re-copy guard (M0 acceptance).
 */
async function ensureWritableDb(): Promise<void> {
  const dir = `${FileSystem.documentDirectory}SQLite`;
  const dest = `${dir}/${DB_NAME}`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return; // already copied on a previous launch — do NOT re-copy

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const asset = Asset.fromModule(require('../../assets/db/ifct2017.db'));
  await asset.downloadAsync();
  await FileSystem.copyAsync({ from: asset.localUri!, to: dest });
}

/**
 * Initialize the database (copy + open + migrate + probe). Safe to call repeatedly;
 * returns the shared connection. Call once early (root layout) before any queries.
 */
export async function initDatabase(): Promise<SqlDb> {
  if (dbInstance) return dbInstance;
  await ensureWritableDb();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await runMigrations(db);
  ftsAvailable = await probeFts(db);
  dbInstance = db;
  return db;
}

/** Get the initialized connection. Throws if initDatabase() hasn't completed. */
export function getDatabase(): SqlDb {
  if (!dbInstance) {
    throw new Error('Database not initialized — call initDatabase() first.');
  }
  return dbInstance;
}
