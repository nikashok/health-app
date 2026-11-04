# Handoff — Nutrition Tracker

Last verified: 2026-11-04. `npx tsc --noEmit` clean, `npm test` (78 unit tests) and
`npm run verify:all` all green (M0–M7 + web data-path + UX SQL), on branch
`claude/keen-wright-odljvf` (the 2026-11 UI/UX pass, six commits).

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
- `useSyncStatus` (zustand store) drives the backup status on Today's header ("Backed up"
  / "Offline · N to back up"); tapping it runs a manual "Back up now" reconcile.
- `favorite_foods` is pushed like the rest, but its Supabase table comes from migration
  0004 (applied by hand). Until then the drain skips favourites (`isMissingTable`,
  `OPTIONAL_REMOTE` in sync.ts) instead of blocking the queue.
- Auth (`src/ui/AuthScreen.tsx`) is sign-in only, no public sign-up — provisioning is
  manual (see memory: supabase-backend).

### App screens (`app/`)
Bottom tabs (`app/(tabs)/`), each with its own large in-screen title (`ScreenTitle`):
- `(tabs)/index.tsx` — **Today**: calories + macros (`DaySummaryCard`, with today's
  plans as "+N planned · projected"), meals (a "+" per meal, plans with "Ate it",
  "Usual: …" hints), trend weight + waist cards, targets-drift nudge, floating Log Food.
- `(tabs)/diary.tsx` — **Diary**: any day (`?date=` links from charts/meals), the same
  `DaySummaryCard`, meals with plans and confirms (all with Undo).
- `(tabs)/progress.tsx` — **Progress**: weight trend chart (1M–All), 7/30-day calorie
  bars (tap a bar to read it, "Open day"), protein averages, waist.
Pushed above the tabs (logo button top right closes back to the tabs):
- `log.tsx` — Add Food: meal picker, "Quick <meal>" (usual / repeat, Log all),
  favourites and meal-aware recents with a one-tap "+", ranked search.
- `log-entry.tsx` / `edit-entry.tsx` — shared `PortionPicker` + `NutritionPreview`;
  Log Entry opens with the food's last portion and has a pinned Log button.
- `custom-food.tsx` — per-100 g or per-serving entry (stored per 100 g), AI lookup.
- `measurement.tsx` — daily weight/waist entry.
- `onboarding.tsx` — profile + targets (also "Edit targets" and the drift nudge).

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
look is "True Black Vivid" (iOS-style: `#000` background, solid `#1c1c1e` cards with no
borders, blue `#0a84ff` for every action, orange `#ff6a1a` for calories, fixed macro
colours `colors.protein/carbs/fat/fibre`, green `#30d158` for body metrics). If asked to
touch visuals, check `theme.ts` first rather than hardcoding colors in screens.
- Icons are SVG (`src/ui/icons.tsx`), not text glyphs. Meal names live in
  `src/ui/meals.ts`; raw-ingredient names are shown via `displayFoodName` (drops the
  Latin binomial — display only).
- Feedback: `showToast(msg, { tone, action })` (Undo lives here); `showError` for failed
  saves; `confirmDestructive/confirmProceed` use the in-app sheet on web.
- Calorie bars: on target solid green, over solid red, under = outlined dim green (a
  shape difference, not two greens).

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

- **Run migration 0004** (`supabase/migrations/0004_favorite_foods.sql`) in the Supabase
  SQL editor; until then favourites stay on the device and show as "to back up".
- **INDB data quality (not fixed — needs a sourced decision):** ~125 dishes have a
  default serving over 800 kcal, and several fried items list 650–790 kcal/100 g (Poori
  738, Vegetable cutlet 665), close to pure-fat density. Logging uses these numbers as
  given; search rows now show "1 poori ≈ 933 kcal", which makes them visible.
- iOS-specific behaviour (home-indicator inset under the tab bar, keyboard, standalone
  web-app quirks) can't be checked headlessly here — Chromium only.
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
3. Run `npx tsc --noEmit`, `npm test` and `npm run verify:all` before considering a
   change done. All are fast (well under a minute total) and are the acceptance bar this
   project has used at every milestone (`verify:ux` covers the 2026-11 UX SQL).

## 7. Useful pointers (see project memory for more)

- DB build pipeline: `db_build/build_db.py`, sourced from spreadsheets in
  `db_build/sources/` (not further documented here — see memory: bundled-db-provenance).
- M0 migration SQL is centralized in `src/db/m0Sql.ts`; acceptance is verified
  headlessly via Node's built-in `node:sqlite`, not a simulator/emulator.
- Web port made the app cross-platform via sql.js behind the shared `SqlDb`
  interface; `npm run build:web` produces the static site deployed on Vercel.
