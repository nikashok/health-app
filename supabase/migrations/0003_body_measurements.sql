-- ============================================================================
-- 0003 — body_measurements (daily weight + waist).
--
-- Backup target for the local-first daily measurement log. One row per (user, day);
-- the device pushes idempotent upserts keyed by (user_id, measured_on).
--
-- Additive and idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS);
-- never drops data. Run ONCE in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.body_measurements (
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  measured_on date not null,
  weight_kg   real,
  waist_cm    real,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, measured_on)
);

alter table public.body_measurements enable row level security;

drop policy if exists "own measurements" on public.body_measurements;
create policy "own measurements" on public.body_measurements
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists t_body_measurements_updated on public.body_measurements;
create trigger t_body_measurements_updated before update on public.body_measurements
  for each row execute function public.set_updated_at();
