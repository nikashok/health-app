/**
 * Platform-agnostic DB interface + M0 migration.
 *
 * Both the native driver (database.ts → expo-sqlite) and the web driver
 * (database.web.ts → sql.js) implement `SqlDb`, so the migration — and every
 * src/db/* data-access function that calls these five methods — runs identically on
 * iOS/Android and the browser. The SQL itself lives in ./m0Sql.
 */
import {
  DISH_MEASURES_INSERT,
  FTS_PROBE,
  GLOBAL_MEASURES,
  GLOBAL_MEASURES_INSERT,
  N001_OVERRIDE,
  SCHEMA_VERSION,
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
  if (row && row.version >= SCHEMA_VERSION) return; // already migrated

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
