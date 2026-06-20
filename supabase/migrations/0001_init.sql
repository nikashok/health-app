-- ============================================================================
-- Nutrition Tracker — initial cloud schema (Supabase / Postgres)
--
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- It is additive and idempotent (IF NOT EXISTS / CREATE OR REPLACE). It NEVER
-- drops anything, so re-running it can't delete user data.
--
-- Two protected layers:
--   1. Reference food data (foods, cooked_foods) — READ-ONLY to every user. No
--      write policy exists, so the app physically cannot edit it by mistake.
--   2. User data (user_profile, log_entries, custom_foods) — each row owned by a
--      user_id; Row-Level Security ensures a user only ever sees/edits their own.
-- ============================================================================

-- updated_at maintenance ------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 1. REFERENCE FOOD DATA (read-only)
-- ============================================================================
create table if not exists public.foods (
  code            text primary key,
  name            text not null,
  common_name     text,
  scientific_name text,
  group_code      text,
  food_group      text,
  energy_kcal     real,
  energy_kj       real,
  protein_g       real,
  fat_g           real,
  carb_g          real,
  fibre_g         real,
  water_g         real,
  ash_g           real,
  regions         text,
  qa_note         text
);

create table if not exists public.cooked_foods (
  food_code                 text primary key,
  food_name                 text not null,
  primarysource             text,
  energy_kcal               real,
  energy_kj                 real,
  carb_g                    real,
  protein_g                 real,
  fat_g                     real,
  freesugar_g               real,
  fibre_g                   real,
  sodium_mg                 real,
  servings_unit             text,
  unit_serving_energy_kcal  real,
  qa_note                   text
);

alter table public.foods        enable row level security;
alter table public.cooked_foods enable row level security;

-- Read-only to any signed-in user. (No insert/update/delete policy = no writes.)
drop policy if exists "foods read"        on public.foods;
drop policy if exists "cooked_foods read" on public.cooked_foods;
create policy "foods read"        on public.foods        for select to authenticated using (true);
create policy "cooked_foods read" on public.cooked_foods for select to authenticated using (true);

-- ============================================================================
-- 2. USER DATA (owner-only, RLS-enforced)
-- ============================================================================

-- One profile row per user. -------------------------------------------------
create table if not exists public.user_profile (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  sex              text,
  age              integer,
  dob              text,
  height_cm        real,
  weight_kg        real,
  activity_level   text,
  goal             text,
  target_kcal      real,
  target_protein_g real,
  target_carb_g    real,
  target_fat_g     real,
  targets_source   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- The diary. Future log_date allowed (planning). Nutrition columns are snapshots
-- written at log time — never recomputed. ----------------------------------
create table if not exists public.log_entries (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  log_date     date not null,
  meal_type    text not null check (meal_type in ('breakfast','lunch','snack','dinner')),
  status       text not null default 'logged' check (status in ('planned','logged')),
  food_code    text,
  food_table   text not null check (food_table in ('foods','cooked_foods','custom')),
  food_name    text not null,
  measure_name text not null,
  quantity     real not null,
  grams_total  real not null,
  kcal         real not null,
  protein_g    real,
  fat_g        real,
  carb_g       real,
  fibre_g      real,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_log_entries_user_date
  on public.log_entries (user_id, log_date, status);

-- User-added foods, reusable in search. code is unique per user. -------------
create table if not exists public.custom_foods (
  user_id                uuid not null references auth.users (id) on delete cascade default auth.uid(),
  code                   text not null,
  name                   text not null,
  energy_kcal            real not null,
  protein_g              real,
  fat_g                  real,
  carb_g                 real,
  fibre_g                real,
  sodium_mg              real,
  default_measure_name   text,
  default_grams_per_unit real,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.user_profile enable row level security;
alter table public.log_entries  enable row level security;
alter table public.custom_foods enable row level security;

-- Owner-only access. One policy per table covers all verbs. ------------------
drop policy if exists "own profile" on public.user_profile;
create policy "own profile" on public.user_profile
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own entries" on public.log_entries;
create policy "own entries" on public.log_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own custom foods" on public.custom_foods;
create policy "own custom foods" on public.custom_foods
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- updated_at triggers --------------------------------------------------------
drop trigger if exists t_user_profile_updated on public.user_profile;
create trigger t_user_profile_updated before update on public.user_profile
  for each row execute function public.set_updated_at();

drop trigger if exists t_log_entries_updated on public.log_entries;
create trigger t_log_entries_updated before update on public.log_entries
  for each row execute function public.set_updated_at();

drop trigger if exists t_custom_foods_updated on public.custom_foods;
create trigger t_custom_foods_updated before update on public.custom_foods
  for each row execute function public.set_updated_at();
