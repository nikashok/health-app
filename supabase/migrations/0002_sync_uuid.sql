-- ============================================================================
-- 0002 — sync_uuid for the local-first backup model.
--
-- The on-device SQLite DB is now the source of truth; Supabase is a one-way backup.
-- Pushes from the device are idempotent upserts keyed by a stable, client-owned
-- `sync_uuid` (custom_foods already key on `code`, user_profile on `user_id`).
--
-- Additive and idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS):
-- it NEVER drops or rewrites existing data. The backfill only fills NULLs, so existing
-- rows keep a stable key and a later device push upserts in place (no duplicates).
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query → Run), BEFORE the
-- app first hydrates from this project. (If the app hydrates first, it backfills any
-- still-NULL sync_uuid itself, so order is not strictly required — but running this
-- first is cleaner.)
-- ============================================================================

alter table public.log_entries add column if not exists sync_uuid text;

-- Give every existing row a stable key (only touches NULLs).
update public.log_entries
   set sync_uuid = gen_random_uuid()::text
 where sync_uuid is null;

-- Idempotent upserts (onConflict: sync_uuid) need a unique constraint.
create unique index if not exists idx_log_entries_sync_uuid
  on public.log_entries (sync_uuid);
