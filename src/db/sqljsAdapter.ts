/**
 * sql.js → SqlDb adapter (web).
 *
 * Wraps a synchronous sql.js Database in the async SqlDb interface (./migrate) the
 * whole app codes against, so every src/db/* data-access function runs unchanged on
 * the web. `onMutate` fires after any write (and once per committed transaction) so
 * the caller can persist the in-memory DB (sql.js holds everything in RAM).
 *
 * Pure with respect to the environment (no DOM/browser APIs), so it runs in node too
 * and is exercised by scripts/verify_web.mjs against the real WASM engine.
 */
import type { BindParams, Database } from 'sql.js';

import type { SqlDb, SqlRunResult, SqlValue } from './migrate';

function toBind(params: SqlValue[]): BindParams {
  // sql.js treats undefined oddly; normalize to NULL.
  return params.map((p) => (p === undefined ? null : p)) as BindParams;
}

export function createSqlDb(db: Database, onMutate?: () => void): SqlDb {
  let inTransaction = false;
  const persist = () => {
    if (!inTransaction) onMutate?.();
  };

  return {
    async execAsync(source: string): Promise<void> {
      db.exec(source);
      persist();
    },

    async runAsync(source: string, ...params: SqlValue[]): Promise<SqlRunResult> {
      db.run(source, toBind(params));
      const lastInsertRowId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
      const changes = db.getRowsModified();
      persist();
      return { lastInsertRowId, changes };
    },

    async getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null> {
      const stmt = db.prepare(source);
      try {
        stmt.bind(toBind(params));
        return stmt.step() ? (stmt.getAsObject() as T) : null;
      } finally {
        stmt.free();
      }
    },

    async getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]> {
      const stmt = db.prepare(source);
      const rows: T[] = [];
      try {
        stmt.bind(toBind(params));
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
      } finally {
        stmt.free();
      }
      return rows;
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      db.exec('BEGIN');
      inTransaction = true;
      try {
        await task();
        db.exec('COMMIT');
        inTransaction = false;
        onMutate?.(); // persist once for the whole transaction
      } catch (e) {
        db.exec('ROLLBACK');
        inTransaction = false;
        throw e;
      }
    },
  };
}
