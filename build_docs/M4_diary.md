# M4 — Diary / Day screen (DIARY-1…7, EDIT-1…4)

**Goal:** the day's food diary; the screen reached from "Add Entry".

## Tasks
1. Date header + change: prev/next + date picker. Default today. **Future dates
   allowed** (planning, M6).
2. Four meal sections in order: Breakfast, Lunch, Evening Snack, Dinner. Each lists
   its entries (dish, portion, kcal) + a per-meal subtotal.
3. Day total (kcal + macros vs target) on this screen too.
4. **Add** on a meal -> Log Food (M3) prefilled with that meal + the current date.
5. Tap an entry -> Edit (change dish/measure/quantity/meal/date; delete).
   Editing **re-snapshots**; moving updates both days' totals.
6. Empty meal sections show a light "Add …" affordance.

## Acceptance
Entries appear under the right meal/date; editing re-snapshots; moving an entry
updates both days; navigating to a future date works.
