# M3 — Log Food screen (LOG-1…8, CUST-1)

**Goal:** the friction-critical log path. This is where the per-100g design pays off.

## Tasks
1. Search (M1) -> select dish.
2. **Measure picker** from `measures` (`WHERE food_code=? OR food_code IS NULL`),
   plus "grams" always (factor 1). Default = food's default measure x 1.
3. Quantity field. **Live preview** of kcal + macros before saving:
   `kcal = food.energy_kcal * (qty * grams_per_unit) / 100`  (same for macros).
4. **Recently logged** (last N distinct foods) above search — one-tap re-add.
5. Save = **snapshot** kcal/macros into a `log_entries` row (`status='logged'`,
   selected meal + date). Never store from `serving_*`.
6. "Can't find it?" -> custom quick-add (CUST-1): name + kcal required, macros
   optional, default measure/weight; saved to `custom_foods`, reusable in search.

## Acceptance
Logging 150 g of *Masala dosa* (ASC146, 164.6 kcal/100g) writes a row with
**kcal = 246.9** and proportional macros; a household measure scales correctly;
recents show prior foods; a custom food saves and is reusable.
