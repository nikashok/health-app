# M5 — Home / insights (HOME-1…7)

**Goal:** the homepage — insights for today, week, month, in that order.

## Tasks
1. **Today** (top): calories consumed vs target (hero), protein/carb/fat rings vs
   target, per-meal calorie split (breakfast/lunch/snack/dinner).
2. **Week**: avg daily kcal vs target, 7-day calorie trend (bar/line), days-on-target.
3. **Month**: same shape over ~30 days, trend-first.
4. **Add Entry** button, **bottom-center**, -> Diary.
5. Surfaced nutrients: calories + 3 macros default; add fibre + sodium if confirmed
   (PRD §9 #4; sodium only on cooked_foods).
6. Empty/partial states: new user -> "Log your first meal" (not empty charts);
   <7 / <30 days -> render partial range, labelled partial.

Consumed totals = SUM of `status='logged'` snapshots for the date(s). Target is the
denominator from `user_profile`.

## Acceptance
Today's totals equal the sum of today's logged snapshots; rings use the target
denominator; with no data, "Log your first meal" shows instead of empty charts.
