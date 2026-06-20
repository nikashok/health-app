/**
 * Database bootstrap — WEB (browser), via sql.js (SQLite compiled to WASM).
 *
 * Metro resolves this file instead of database.ts when the platform is web, so the
 * rest of src/db/* is unchanged. Flow:
 *  1. Load persisted DB bytes from IndexedDB if present (the user's data from a prior
 *     visit); otherwise fetch the bundled read-only ifct2017.db asset.
 *  2. Open it in sql.js and run the shared M0 migration (idempotent, schema_version
 *     gated) — so a returning user skips it.
 *  3. Probe FTS5 (absent in the stock sql.js build) → search falls back to LIKE.
 *  4. Persist the in-memory DB back to IndexedDB after every write (debounced).
 *
 * The WASM binary is served from /sql-wasm.wasm (public/), so the app stays offline-
 * capable once cached — no CDN.
 */
import { Asset } from 'expo-asset';
import initSqlJs from 'sql.js';

import { probeFts, runMigrations, type SqlDb } from './migrate';
import { createSqlDb } from './sqljsAdapter';

const IDB_NAME = 'nutrition-tracker';
const IDB_STORE = 'kv';
const DB_KEY = 'ifct2017.db';

let dbInstance: SqlDb | null = null;
let ftsAvailable = true;

export function isFtsAvailable(): boolean {
  return ftsAvailable;
}

// ---- tiny IndexedDB key/value store (single binary blob) -----------------
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key: string): Promise<Uint8Array | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as Uint8Array | undefined);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbSet(key: string, value: Uint8Array): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadBundledDbBytes(): Promise<Uint8Array> {
  const asset = Asset.fromModule(require('../../assets/db/ifct2017.db'));
  await asset.downloadAsync();
  const res = await fetch(asset.localUri ?? asset.uri);
  return new Uint8Array(await res.arrayBuffer());
}

export async function initDatabase(): Promise<SqlDb> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs({ locateFile: (file: string) => `/${file}` });

  // Returning user's data, else the bundled reference DB.
  const saved = await idbGet(DB_KEY);
  const sqlDb = new SQL.Database(saved ?? (await loadBundledDbBytes()));

  // Persist (debounced) after writes; sql.js is in-memory, so this is durability.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      idbSet(DB_KEY, sqlDb.export()).catch((e) =>
        console.warn('[db] failed to persist to IndexedDB', e)
      );
    }, 250);
  };

  const db = createSqlDb(sqlDb, persist);
  await runMigrations(db); // idempotent; a returning user's DB skips it
  ftsAvailable = await probeFts(db);
  dbInstance = db;
  return db;
}

export function getDatabase(): SqlDb {
  if (!dbInstance) {
    throw new Error('Database not initialized — call initDatabase() first.');
  }
  return dbInstance;
}
