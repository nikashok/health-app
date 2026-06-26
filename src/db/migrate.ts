/**
 * Platform-agnostic DB interface + M0 migration.
 *
 * Both the native driver (database.ts → expo-sqlite) and the web driver
 * (database.web.ts → sql.js) implement `SqlDb`, so the migration — and every
 * src/db/* data-access function that calls these five methods — runs identically on
 * iOS/Android and the browser. The SQL itself lives in ./m0Sql.
 */
import {
  ADD_LOG_ENTRIES_SYNC_UUID,
  BODY_MEASUREMENTS_DDL,
  DISH_MEASURES_INSERT,
  FTS_PROBE,
  GLOBAL_MEASURES,
  GLOBAL_MEASURES_INSERT,
  INDEX_LOG_ENTRIES_SYNC_UUID,
  LOG_ENTRIES_SYNC_UUID_COLUMN,
  N001_OVERRIDE,
  SCHEMA_VERSION,
  SYNC_TABLES_DDL,
  USER_TABLES_DDL,
} from './m0Sql';

export type SqlValue = string | number | null;
export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

/** The minimal async SQLite surface the app codes against (matches expo-sqlite). */
export interface SqlDb {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/**
 * Run the M0 migration exactly once. Idempotent: gated on schema_version, and the
 * whole step runs in a transaction so a crash leaves it un-applied (and retried).
 */
export async function runMigrations(db: SqlDb): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)'
  );
  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );
  if (!(row && row.version >= SCHEMA_VERSION)) {
    // M0 not yet applied — run it once, gated by schema_version.
    await db.withTransactionAsync(async () => {
      for (const ddl of USER_TABLES_DDL) {
        await db.execAsync(ddl);
      }
      await db.execAsync(N001_OVERRIDE);

      for (const [name, grams] of GLOBAL_MEASURES) {
        await db.runAsync(GLOBAL_MEASURES_INSERT, name, grams);
      }
      await db.execAsync(DISH_MEASURES_INSERT);

      await db.runAsync('DELETE FROM schema_version');
      await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', SCHEMA_VERSION);
    });
  }

  // Sync schema is layered on top of M0 every launch (idempotent, additive). It lives
  // OUTSIDE the SCHEMA_VERSION gate so it never re-runs M0's non-idempotent seed.
  await ensureSyncSchema(db);
}

/**
 * Ensure the local-first sync schema exists (outbox, meta, log_entries.sync_uuid).
 * All statements are idempotent: the tables/index use IF NOT EXISTS, and the
 * ADD COLUMN is guarded by a PRAGMA check (SQLite lacks ADD COLUMN IF NOT EXISTS).
 */
export async function ensureSyncSchema(db: SqlDb): Promise<void> {
  for (const ddl of SYNC_TABLES_DDL) {
    await db.execAsync(ddl);
  }
  await db.execAsync(BODY_MEASUREMENTS_DDL);
  const cols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(log_entries)'
  );
  if (!cols.some((c) => c.name === LOG_ENTRIES_SYNC_UUID_COLUMN)) {
    await db.execAsync(ADD_LOG_ENTRIES_SYNC_UUID);
  }
  await db.execAsync(INDEX_LOG_ENTRIES_SYNC_UUID);
}

/** Probe FTS5. Returns false when unavailable (→ caller falls back to LIKE search). */
export async function probeFts(db: SqlDb): Promise<boolean> {
  try {
    await db.getFirstAsync(FTS_PROBE);
    return true;
  } catch (e) {
    console.warn('[db] FTS5 unavailable — falling back to LIKE search.', e);
    return false;
  }
}
