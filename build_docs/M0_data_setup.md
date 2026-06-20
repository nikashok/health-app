# M0 — Scaffold + data layer

**Goal:** Expo app boots, bundled DB is usable, user tables + measures exist.
Everything sits on this — get it exactly right.

## Tasks
1. Init Expo (TypeScript) + Expo Router. Add a nav shell: empty Home (tab) +
   reachable Diary, so the app navigates.
2. **Copy DB to writable storage on first launch** (asset is read-only):
```ts
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import * as SQLite from 'expo-sqlite';
const DB_NAME = 'ifct2017.db';
async function openDb() {
  const dir = `${FileSystem.documentDirectory}SQLite`;
  const dest = `${dir}/${DB_NAME}`;
  if (!(await FileSystem.getInfoAsync(dest)).exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const asset = Asset.fromModule(require('../../assets/db/ifct2017.db'));
    await asset.downloadAsync();
    await FileSystem.copyAsync({ from: asset.localUri!, to: dest });
  }
  return SQLite.openDatabaseAsync(DB_NAME);
}
```
3. **Verify FTS5** works: `SELECT * FROM foods_fts LIMIT 1`. If it throws, fall back to
   `LIKE` search everywhere and note the downgrade.
4. **Migrations** (run once; gate on a `schema_version` row). Create per PRD §7:
   - `user_profile` (sex, age, height_cm, weight_kg, activity_level, goal,
     target_kcal, target_protein_g, target_carb_g, target_fat_g, targets_source).
   - `log_entries` — **include `status` (`planned`|`logged`)**, allow future `log_date`.
   - `custom_foods` — shaped like the shared core columns.
   - `measures` (food_code TEXT NULL, food_table TEXT NULL, measure_name TEXT,
     grams_per_unit REAL, is_default INTEGER). `food_code IS NULL` = global measure.
5. **N001 override** (source typo): `UPDATE foods SET energy_kcal=191.0, energy_kj=801.0
   WHERE code='N001';`
6. **Seed `measures` (standardized — PRD §9 #2):**
   - Global household measures (`food_code=NULL`), **placeholder grams — VERIFY against
     NIN household-measure tables, flagged weak:** katori 150, bowl 200, cup 240,
     glass 250, tbsp 15, tsp 5, piece 30.
   - Per cooked dish: its INDB serving unit, grams = `serving_energy_kcal/energy_kcal*100`,
     `is_default=1` — EXCEPT rows where `cooked_foods.qa_note IS NOT NULL` (the 41 broken
     servings): skip the dish-serving as default, let a global measure default instead.
   - "grams" is NOT stored — UI always offers it (factor 1). Food's measures query:
     `SELECT * FROM measures WHERE food_code=? OR food_code IS NULL`.

## Acceptance
App boots; `SELECT count(*)` = 528 / 1014; user tables exist; `measures` has global +
dish rows; `foods` where code='N001' reads ~191 kcal; **second launch does not
re-copy** the DB.
