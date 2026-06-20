# M6 — Meal planning (PLAN-1…8)

**Goal:** plan meals to future dates, confirm-to-log. Reuses the whole log+insights
stack — new surface area is a status flag + a confirm action.

## Tasks
1. PLAN-1: entries added to a **future date** save with `status='planned'` (same Log
   Food screen).
2. PLAN-2: planned entries visually distinct in the Diary (outline + "Planned" tag).
3. PLAN-3: insights for a future date show **planned totals vs target**, labelled a
   plan (reuses M5 math).
4. PLAN-4: **Confirm / "Ate it"** flips `planned -> logged`; provide Confirm-all per
   meal and per day.
5. PLAN-5/6: edit a planned entry (normal edit) / delete it.
6. **PLAN-7 (the honesty rule):** insights count only `logged` as consumed. `planned`
   — future OR past-unconfirmed — is never counted as intake. An unconfirmed past plan
   stays a plan until confirmed/edited/deleted.
7. PLAN-8: on today, consumed = confirmed only; planned-but-unconfirmed for the rest
   of the day shows as a lighter "planned" overlay (doesn't inflate consumed).

## Acceptance
Plan a dish tomorrow -> shows as planned, appears in tomorrow's plan-vs-target,
contributes **nothing** to today's consumed; confirming flips status and updates
intake; an unconfirmed **past** plan is **not** counted as eaten.
