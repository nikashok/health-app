-- ============================================================================
-- 0004 — favorite_foods (starred foods shown first in Add Food).
--
-- Backup target for the local-first favourites list. One row per (user, food); the
-- device pushes idempotent upserts keyed by (user_id, fav_key), where fav_key is
-- "<food_table>:<food_code>" (e.g. "cooked_foods:ASC096"). Unstarring deletes the row.
--
-- Additive and idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); never drops data.
-- Run ONCE in the Supabase SQL editor. Until it is run, the app keeps favourites on the
-- device and skips them when backing up (everything else still backs up).
-- ============================================================================

create table if not exists public.favorite_foods (
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  fav_key     text not null,
  food_table  text not null,
  food_code   text not null,
  food_name   text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, fav_key)
);

alter table public.favorite_foods enable row level security;

drop policy if exists "own favorites" on public.favorite_foods;
create policy "own favorites" on public.favorite_foods
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
