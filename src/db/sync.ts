/**
 * Local-first → Supabase backup sync (single primary device).
 *
 * The on-device SQLite DB is the source of truth. Every user write is durable locally
 * and also drops a row into `sync_outbox` (a dirty-key set) in the SAME transaction —
 * so if data is committed locally, a push is guaranteed to be queued. A background
 * drain reads each dirty key, re-loads the CURRENT local row, and upserts it to Supabase
 * (or deletes remotely if the local row is gone). Re-reading current truth means the
 * outbox self-collapses and pushes are idempotent (keyed by sync_uuid / code / user_id),
 * so retries are safe. The queue lives on disk, so it survives app kills and offline
 * stretches; nothing is lost.
 *
 * Pull is one-time: `hydrateFromSupabase` restores a fresh install (and migrates the
 * user's existing cloud rows into local on first upgrade). We never delete from Supabase
 * as part of migration — it stays an intact backup throughout.
 */
import { create } from 'zustand';

import { getDatabase } from './database';
import { INSERT_CUSTOM_FOOD } from './customFoodsSql';
import { UPSERT_PROFILE } from './profileSql';
import { requireUserId, supabase } from './supabase';
import type { SqlDb } from './migrate';

type SyncTable = 'log_entries' | 'custom_foods' | 'user_profile' | 'body_measurements';

/** Single-row profile key (local id is pinned to 1; remote keys on user_id). */
const PROFILE_KEY = 'me';
const MAX_ATTEMPTS = 10;

/** Columns pushed to each Supabase table (local-only `id` is never sent). */
const REMOTE_COLUMNS: Record<SyncTable, string[]> = {
  log_entries: [
    'sync_uuid', 'log_date', 'meal_type', 'status', 'food_code', 'food_table',
    'food_name', 'measure_name', 'quantity', 'grams_total', 'kcal', 'protein_g',
    'fat_g', 'carb_g', 'fibre_g', 'created_at', 'updated_at',
  ],
  custom_foods: [
    'code', 'name', 'energy_kcal', 'protein_g', 'fat_g', 'carb_g', 'fibre_g',
    'sodium_mg', 'default_measure_name', 'default_grams_per_unit', 'created_at', 'updated_at',
  ],
  user_profile: [
    'sex', 'age', 'dob', 'height_cm', 'weight_kg', 'activity_level', 'goal',
    'target_kcal', 'target_protein_g', 'target_carb_g', 'target_fat_g',
    'targets_source', 'created_at', 'updated_at',
  ],
  body_measurements: ['measured_on', 'weight_kg', 'waist_cm', 'created_at', 'updated_at'],
};
const ON_CONFLICT: Record<SyncTable, string> = {
  log_entries: 'sync_uuid',
  custom_foods: 'user_id,code',
  user_profile: 'user_id',
  body_measurements: 'user_id,measured_on',
};
/** Column used to delete a row remotely by its stable key (profile is never deleted). */
const DELETE_KEY: Record<SyncTable, string> = {
  log_entries: 'sync_uuid',
  custom_foods: 'code',
  user_profile: 'user_id',
  body_measurements: 'measured_on',
};

// ---- sync-status store (drives the indicator + "Back up now") --------------
export interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
}
export const useSyncStatus = create<SyncStatus>(() => ({
  pending: 0,
  syncing: false,
  lastError: null,
  lastSyncedAt: null,
}));
const setStatus = (p: Partial<SyncStatus>) => useSyncStatus.setState(p);

/** A client-owned, globally-unique key (text — remote column is text, not uuid). */
export function newSyncId(): string {
  const r = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${r()}-${r()}`;
}

// ---- enqueue (called inside each write's transaction) ----------------------
const ENQUEUE_SQL = `
  INSERT INTO sync_outbox (table_name, row_key, queued_at, attempts)
  VALUES (?, ?, ?, 0)
  ON CONFLICT(table_name, row_key) DO UPDATE SET queued_at = excluded.queued_at, attempts = 0`;

/** Mark (table, key) dirty. Runs on the caller's `db` so it shares their transaction. */
export function enqueue(db: SqlDb, table: SyncTable, key: string): Promise<unknown> {
  return db.runAsync(ENQUEUE_SQL, table, key, new Date().toISOString());
}

/** Refresh the pending-count shown in the UI. */
export async function refreshPending(): Promise<void> {
  try {
    const r = await getDatabase().getFirstAsync<{ c: number }>(
      'SELECT count(*) c FROM sync_outbox'
    );
    setStatus({ pending: r?.c ?? 0 });
  } catch {
    /* outbox not ready yet — ignore */
  }
}

/** Debounced background push after a write. Never blocks the caller. */
let drainTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleDrain(): void {
  refreshPending();
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(() => {
    drainTimer = null;
    drainOutbox().catch(() => {});
  }, 400);
}

// ---- the drain -------------------------------------------------------------
type Row = Record<string, unknown>;
function loadLocalRow(table: SyncTable, key: string): Promise<Row | null> {
  const db = getDatabase();
  if (table === 'log_entries')
    return db.getFirstAsync<Row>('SELECT * FROM log_entries WHERE sync_uuid = ?', key);
  if (table === 'custom_foods')
    return db.getFirstAsync<Row>('SELECT * FROM custom_foods WHERE code = ?', key);
  if (table === 'body_measurements')
    return db.getFirstAsync<Row>('SELECT * FROM body_measurements WHERE measured_on = ?', key);
  return db.getFirstAsync<Row>('SELECT * FROM user_profile WHERE id = 1');
}

/** Push one dirty key: upsert the current local row, or delete it remotely if gone. */
async function pushItem(uid: string, table: SyncTable, key: string): Promise<void> {
  const local = await loadLocalRow(table, key);
  if (local) {
    const payload: Record<string, unknown> = { user_id: uid };
    for (const col of REMOTE_COLUMNS[table]) payload[col] = local[col] ?? null;
    const { error } = await supabase.from(table).upsert(payload, { onConflict: ON_CONFLICT[table] });
    if (error) throw error;
  } else {
    if (table === 'user_profile') return; // the profile is never deleted
    const { error } = await supabase.from(table).delete().eq(DELETE_KEY[table], key);
    if (error) throw error;
  }
}

let draining = false;
/** Drain the outbox to Supabase. Single-flight, FIFO, idempotent. Safe to call often. */
export async function drainOutbox(): Promise<void> {
  if (draining) return;
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return; // not signed in — wait for auth, queue persists
  }
  draining = true;
  setStatus({ syncing: true });
  try {
    const db = getDatabase();
    const items = await db.getAllAsync<{ table_name: SyncTable; row_key: string }>(
      `SELECT table_name, row_key FROM sync_outbox WHERE attempts < ? ORDER BY queued_at`,
      MAX_ATTEMPTS
    );
    for (const it of items) {
      try {
        await pushItem(uid, it.table_name, it.row_key);
        await db.runAsync(
          'DELETE FROM sync_outbox WHERE table_name = ? AND row_key = ?',
          it.table_name,
          it.row_key
        );
      } catch (e) {
        await db.runAsync(
          'UPDATE sync_outbox SET attempts = attempts + 1 WHERE table_name = ? AND row_key = ?',
          it.table_name,
          it.row_key
        );
        setStatus({ lastError: e instanceof Error ? e.message : String(e) });
        break; // assume connectivity/transient — leave the rest for the next trigger
      }
    }
    const left = await db.getFirstAsync<{ c: number }>('SELECT count(*) c FROM sync_outbox');
    const pending = left?.c ?? 0;
    setStatus({
      pending,
      ...(pending === 0 ? { lastError: null, lastSyncedAt: new Date().toISOString() } : {}),
    });
  } finally {
    draining = false;
    setStatus({ syncing: false });
  }
}

// ---- hydrate (one-time pull / restore) -------------------------------------
const HYDRATE_INSERT_ENTRY = `
  INSERT INTO log_entries (
    log_date, meal_type, status, food_code, food_table, food_name, measure_name,
    quantity, grams_total, kcal, protein_g, fat_g, carb_g, fibre_g,
    created_at, updated_at, sync_uuid
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * One-time pull from Supabase into local: restores a reinstalled device, and migrates
 * the user's existing cloud rows into local on first upgrade. Idempotent (gated by the
 * `hydrated` marker, and inserts only keys not already local) and never deletes local
 * rows. If offline / not signed in, it no-ops and runs again next launch.
 */
export async function hydrateFromSupabase(): Promise<void> {
  const db = getDatabase();
  const done = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'hydrated'"
  );
  if (done?.value === '1') return;

  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return; // no session yet
  }

  const [profileRes, customRes, entriesRes] = await Promise.all([
    supabase.from('user_profile').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('custom_foods').select('*').eq('user_id', uid),
    supabase.from('log_entries').select('*').eq('user_id', uid),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (customRes.error) throw customRes.error;
  if (entriesRes.error) throw entriesRes.error;

  // body_measurements is newest — tolerate the table not existing yet (migration 0003
  // not run) so the rest of hydrate still restores the diary/profile/custom foods.
  let measureData: Record<string, any>[] = [];
  {
    const r = await supabase.from('body_measurements').select('*').eq('user_id', uid);
    if (r.error) console.warn('[sync] body_measurements unavailable (run migration 0003?)', r.error);
    else measureData = (r.data ?? []) as Record<string, any>[];
  }

  // Backfill any remote log_entries missing a sync_uuid BEFORE inserting locally, so
  // local and remote share the key and later pushes upsert in place (no duplicates).
  // Tolerate the column not existing yet (migration 0002 not run): fall back to a local
  // key so the diary still restores; a later push reconciles once 0002 lands.
  const entries = (entriesRes.data ?? []) as Record<string, any>[];
  for (const e of entries) {
    if (!e.sync_uuid) {
      const uuid = newSyncId();
      const { error } = await supabase.from('log_entries').update({ sync_uuid: uuid }).eq('id', e.id);
      if (error) console.warn('[sync] could not backfill remote sync_uuid (run migration 0002?)', error);
      e.sync_uuid = uuid;
    }
  }

  await db.withTransactionAsync(async () => {
    // Profile: take remote only if local has none (never clobber a local profile).
    if (profileRes.data) {
      const localP = await db.getFirstAsync('SELECT id FROM user_profile WHERE id = 1');
      if (!localP) {
        const p = profileRes.data as Record<string, any>;
        const now = new Date().toISOString();
        await db.runAsync(
          UPSERT_PROFILE,
          p.sex ?? null, p.age ?? null, p.dob ?? null, p.height_cm ?? null,
          p.weight_kg ?? null, p.activity_level ?? null, p.goal ?? null,
          p.target_kcal ?? null, p.target_protein_g ?? null, p.target_carb_g ?? null,
          p.target_fat_g ?? null, p.targets_source ?? null,
          p.created_at ?? now, p.updated_at ?? now
        );
      }
    }
    // Custom foods: insert any code not already local.
    for (const c of (customRes.data ?? []) as Record<string, any>[]) {
      const ex = await db.getFirstAsync('SELECT code FROM custom_foods WHERE code = ?', c.code);
      if (ex) continue;
      const now = new Date().toISOString();
      await db.runAsync(
        INSERT_CUSTOM_FOOD,
        c.code, c.name, c.energy_kcal, c.protein_g ?? null, c.fat_g ?? null,
        c.carb_g ?? null, c.fibre_g ?? null, c.sodium_mg ?? null,
        c.default_measure_name ?? null, c.default_grams_per_unit ?? null,
        c.created_at ?? now, c.updated_at ?? now
      );
    }
    // Diary entries: insert any sync_uuid not already local.
    for (const e of entries) {
      const ex = await db.getFirstAsync('SELECT id FROM log_entries WHERE sync_uuid = ?', e.sync_uuid);
      if (ex) continue;
      const now = new Date().toISOString();
      await db.runAsync(
        HYDRATE_INSERT_ENTRY,
        e.log_date, e.meal_type, e.status, e.food_code ?? null, e.food_table,
        e.food_name, e.measure_name, e.quantity, e.grams_total, e.kcal,
        e.protein_g ?? null, e.fat_g ?? null, e.carb_g ?? null, e.fibre_g ?? null,
        e.created_at ?? now, e.updated_at ?? now, e.sync_uuid
      );
    }
    // Body measurements: insert any date not already local.
    for (const m of measureData) {
      const ex = await db.getFirstAsync(
        'SELECT measured_on FROM body_measurements WHERE measured_on = ?',
        m.measured_on
      );
      if (ex) continue;
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO body_measurements (measured_on, weight_kg, waist_cm, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        m.measured_on, m.weight_kg ?? null, m.waist_cm ?? null,
        m.created_at ?? now, m.updated_at ?? now
      );
    }
    await db.runAsync(
      "INSERT INTO sync_meta (key, value) VALUES ('hydrated', '1') " +
        "ON CONFLICT(key) DO UPDATE SET value = '1'"
    );
  });
}

// ---- reconcile ("Back up now": re-push everything local) -------------------
/** Force-sync: ensure every local row is queued (push-only) and drain. Idempotent. */
export async function reconcile(): Promise<void> {
  const db = getDatabase();
  const missing = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM log_entries WHERE sync_uuid IS NULL'
  );
  for (const m of missing) {
    await db.runAsync('UPDATE log_entries SET sync_uuid = ? WHERE id = ?', newSyncId(), m.id);
  }
  const entries = await db.getAllAsync<{ sync_uuid: string }>(
    'SELECT sync_uuid FROM log_entries WHERE sync_uuid IS NOT NULL'
  );
  const customs = await db.getAllAsync<{ code: string }>('SELECT code FROM custom_foods');
  const measures = await db.getAllAsync<{ measured_on: string }>(
    'SELECT measured_on FROM body_measurements'
  );
  const prof = await db.getFirstAsync('SELECT id FROM user_profile WHERE id = 1');
  await db.withTransactionAsync(async () => {
    for (const e of entries) await enqueue(db, 'log_entries', e.sync_uuid);
    for (const c of customs) await enqueue(db, 'custom_foods', c.code);
    for (const m of measures) await enqueue(db, 'body_measurements', m.measured_on);
    if (prof) await enqueue(db, 'user_profile', PROFILE_KEY);
  });
  await refreshPending();
  await drainOutbox();
}

// ---- bootstrap (called once after DB ready + signed in) --------------------
/** Restore-if-needed, then push anything queued. Never throws (so it can't block boot). */
export async function bootstrapSync(): Promise<void> {
  try {
    await hydrateFromSupabase();
  } catch (e) {
    console.warn('[sync] hydrate failed (will retry next launch)', e);
  }
  await refreshPending();
  drainOutbox().catch(() => {});
}

export { PROFILE_KEY };
