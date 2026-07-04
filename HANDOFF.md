# Handoff — Nutrition Tracker

Last verified: 2026-07-04. `npx tsc --noEmit` clean, `npm run verify:all` all green
(M0–M7 + web data-path), working tree clean on `main`, up to date with `origin/main`.

## 1. What this is

A single-user Indian nutrition tracker. Started as a **local-first, offline, no-backend
v1** (per `CLAUDE.md`/`AGENTS.md`), built milestone-by-milestone (M0–M7). It has since
grown two things the original spec explicitly excluded: a Supabase-backed account/auth
layer, and daily body-weight/waist tracking. Those additions are layered on top without
breaking the original local-first contract — see §4.

Runs on iOS/Android (Expo) and web (Expo web export, deployed to Vercel).

## 2. Architecture

### Data layer (two DBs, one shared migration)
- **Bundled reference DB**: `assets/db/ifct2017.db` — `foods` (528 rows, IFCT 2017) +
  `cooked_foods` (1014 dishes, INDB), both FTS5-indexed. Built offline from source
  spreadsheets by `db_build/build_db.py` (see memory: bundled-db-provenance). Never
  mutated at runtime; `foods.N001` has a known source typo corrected by the M0
  migration (~191 kcal) — do not undo it.
- **User tables** (`user_profile`, `log_entries`, `custom_foods`, `measures`,
  `body_measurements`): created by the M0 migration, defined once in
  `src/db/m0Sql.ts` and run by `src/db/migrate.ts` against whichever platform driver
  is active. Migration is idempotent and re-applied every launch (no version gate
  bump needed for additive changes — see the `f3991a0` commit message).
- **Platform split**: `src/db/database.ts` (native, expo-sqlite) and
  `src/db/database.web.ts` (web, sql.js) both implement the same `SqlDb` interface
  from `src/db/migrate.ts`. Metro resolves the right one per platform automatically.
  On web, sql.js has no FTS5 — search falls back to `LIKE` (`isFtsAvailable()` gates
  this; verified in `scripts/verify_web.mjs`).

### Nutrition math (hard invariants — see `CLAUDE.md`)
1. Everything computes from **per-100g** columns: `value = per100g * grams / 100`.
   Never read `serving_*` columns for math — they're only a default-quantity hint.
2. Computed kcal/macros are **snapshotted** into `log_entries` at log time. Insights
   (`src/db/insights.ts`, `src/calc/*`) read the snapshot, never recompute from
   `food_code` — so editing a food later doesn't retroactively change history.
3. Insights only count `status='logged'`. `status='planned'` rows are shown
   separately (planning, M6) and never counted as intake until explicitly confirmed.
4. All of this is enforced by invariant tests in `src/calc/*.test.ts` and the
   `scripts/verify_m*.mjs` acceptance scripts — see §6 before touching calc code.

### Sync layer (`src/db/sync.ts`) — added after v1
On-device SQLite is still the **source of truth** for reads/writes (instant, offline).
Supabase is a **one-way background backup**:
- Every local write also drops a row into a `sync_outbox` table in the *same
  transaction*, so a commit always implies a queued push — nothing is lost to a crash.
- A background drain re-reads the *current* local row for each dirty key and upserts
  it to Supabase keyed by a stable identity (`sync_uuid` for log entries, `code` for
  custom foods, `user_id` for profile/measurements) — idempotent, safe to retry.
- Pull is **one-time**: `hydrateFromSupabase` restores a fresh install/reinstall, and
  migrates existing cloud rows into local on first upgrade. Supabase is never deleted
  from during migration — it stays an intact backup.
- `useSyncStatus` (zustand store) drives the "☁ Backed up / ↑ Syncing…" chip on
  Home/Diary, plus a manual "Back up now" reconcile action.
- Auth (`src/ui/AuthScreen.tsx`) is sign-in only, no public sign-up — provisioning is
  manual (see memory: supabase-backend).

### App screens (`app/`)
- `(tabs)/index.tsx` — Home: calorie ring, protein bar, week/month bar charts,
  lifetime weight/waist sparklines, backup status, today's meals. This file is large
  (~1500+ lines after the Vital Dark redesign) — the biggest single file in the repo.
- `log.tsx` / `log-entry.tsx` / `edit-entry.tsx` — search + log/edit a food entry.
- `diary.tsx` — full log history browser.
- `custom-food.tsx` — create/edit/delete user-defined foods, with optional AI lookup.
- `measurement.tsx` — daily weight/waist entry.
- `onboarding.tsx` — first-run profile + target setup.

### AI nutrition lookup (`api/lookup.ts`, `src/db/nutritionLookup.ts`)
Serverless function (Vercel) used from `custom-food.tsx` to look up nutrition facts
for a food name the user types. Two-step: a web-search-capable OpenAI model
(`OPENAI_SEARCH_MODEL`, default `gpt-4.1`) grounds the answer with citations, then a
cheaper extraction model (`OPENAI_MODEL`, default `gpt-4.1-mini`) turns that into
strict JSON. Configured via `.env.local` (`OPENAI_API_KEY`, see `.env.example`).
Needs `maxDuration` raised on Vercel (already done — see `97817f9`) because the
search step is slow.

### Web deploy
`npm run build:web` → `expo export --platform web` → static `dist/`. `vercel.json`
rewrites everything except `/api/*` to `/index.html` (SPA) — zero-config deploy.

## 3. Design system

`src/ui/theme.ts` + `src/ui/components.tsx` hold the shared tokens/components. Current
look is "Vital Dark" (dark palette, amber `#ffb454` accent, orange gradient protein bar,
FAB darkened ~25% to `#b06228`). If asked to touch visuals, check `theme.ts` first
rather than hardcoding colors in screens.

## 4. Where this diverges from the original CLAUDE.md spec

`CLAUDE.md`/`AGENTS.md` still say "no backend," "v1 only," and list weight tracking as
excluded (`// TODO v1.1:`). Both of those have since shipped:
- Supabase backend for profile/log_entries/custom_foods/body_measurements, RLS-gated,
  auth-required (`e74b369`, `0a51f01`, `f3991a0`).
- Daily weight + waist tracking (`f3991a0`).

**Nobody has gone back and updated `CLAUDE.md`/`AGENTS.md` to reflect this.** If you
pick this project up, either (a) treat those docs as historical/aspirational for the
math and scope invariants (which still hold) but stale on "no backend" and "no weight
tracking," or (b) update them — whichever the next owner prefers. Don't let the stale
"no backend" line stop you from touching `src/db/sync.ts` or Supabase migrations.

## 5. Known rough edges / things to watch

- `app/(tabs)/index.tsx` is doing too much (charts + sparklines + sync status + FAB +
  meal list all in one file after the redesign commit). Next nontrivial Home change
  is a good time to split it.
- Supabase migrations (`supabase/migrations/0001..0003`) are applied manually — there's
  no migration runner wired into CI/deploy. `sync.ts` hydrate tolerates
  not-yet-applied migrations defensively (see its comment), but new schema changes
  still need someone to run the SQL against the Supabase project by hand.
- Web search fallback (LIKE instead of FTS5) is a real, tested code path, not a
  theoretical one — don't assume FTS5 semantics (ranking, prefix matching) hold on web.
- `jest` needs a local install to run `npm test` (see memory: milestones-status) —
  the headless `scripts/verify_m*.mjs` suite is what's authoritative for acceptance
  and what CI-equivalent checks should run (`npm run verify:all`).

## 6. Before you change anything

1. Read `CLAUDE.md` for the hard math/scope rules (per-100g basis, snapshotting,
   logged-vs-planned) — those still hold regardless of the backend/weight additions.
2. Read the relevant `build_docs/Mx_*.md` if touching a milestone's original feature
   area — they document intended behavior and acceptance criteria in detail.
3. Run `npx tsc --noEmit` and `npm run verify:all` before considering a change done.
   Both are fast (well under a minute total) and are the actual acceptance bar this
   project has used at every milestone.

## 7. Useful pointers (see project memory for more)

- DB build pipeline: `db_build/build_db.py`, sourced from spreadsheets in
  `db_build/sources/` (not further documented here — see memory: bundled-db-provenance).
- M0 migration SQL is centralized in `src/db/m0Sql.ts`; acceptance is verified
  headlessly via Node's built-in `node:sqlite`, not a simulator/emulator.
- Web port made the app cross-platform via sql.js behind the shared `SqlDb`
  interface; `npm run build:web` produces the static site deployed on Vercel.
