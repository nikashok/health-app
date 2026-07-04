# Nutrition Tracker — agent context

Local-first, offline, single-user Indian nutrition tracker. Expo (React Native) +
TypeScript + expo-sqlite. No backend. **v1 only.**

## Data
- Bundled `assets/db/ifct2017.db`: `foods` (528 raw, IFCT 2017) + `cooked_foods`
  (1014 dishes, INDB), both with FTS5. Copy to writable storage on first launch;
  never mutate these tables at runtime.
- User tables (created by migration, M0): `user_profile`, `log_entries`,
  `custom_foods`, `measures`.

## Hard rules (do not violate)
1. All nutrition math uses the per-100g basis: `value = per100g * grams / 100`.
   Never compute from the `serving_*` columns — they are at most a default suggestion.
2. Snapshot computed kcal/macros into `log_entries`; insights read snapshots, never
   recompute from food_code.
3. Insights count only `status='logged'`. `planned` rows are shown separately and
   never counted as intake. Unconfirmed past plans are NOT "eaten".
4. foods.N001 has a source typo corrected by migration (~191 kcal). Don't undo it.

## Scope
v1 only. EXCLUDED (leave `// TODO v1.1:`): planning templates, weight tracking,
favorites, reminders, build-from-ingredients, photo/AI, exercise, backend, sync,
barcode.

## How to build
One milestone at a time, in order. For each: read `build_docs/Mx_*.md`, implement,
pass its acceptance check, then move on. Full guide: `build_docs/BUILD_GUIDE.md`.

## Commands
- `npx expo start`   # run
- `npm test`         # unit + invariant tests

## Addendum (2026-07): scope changes since v1

The "no backend" and "no weight tracking" lines above are historical. Shipped since:
- Supabase one-way backup + auth (`src/db/sync.ts`). Local SQLite remains the source of
  truth for all reads and writes.
- `body_measurements` (daily weight/waist) + measurement screen.
- Read-side insights layer (`src/calc/trend.ts`, `src/calc/tdee.ts`,
  `src/calc/foodPatterns.ts`; `app/insights.tsx`).

The four invariants above still hold. Two more now apply:
5. Trend weight, TDEE, forecasts, and food-pattern stats are DERIVED views over
   snapshots/measurements. They are never persisted and never synced; insights code
   never writes.
6. Insights read only snapshotted values in `log_entries`. Never join back to
   `foods`/`cooked_foods` for intake math. If a nutrient isn't snapshotted, metrics
   needing it are deferred rather than joined.
