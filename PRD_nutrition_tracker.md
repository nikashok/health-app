# PRD — Indian Nutrition Tracker (working title)

**Status:** Draft v0.1 · **Owner:** Nikhil · **Last updated:** 20 Jun 2026

> Convention: requirements you specified are marked **[brief]**; everything else
> is a gap I filled, marked **[added]**. The consequential additions are
> consolidated in §9 *Open Decisions* so you can accept or overrule them.

---

## 1. Overview

A personal nutrition tracker built for Indian eating. The user logs what they eat
across the day; the app shows calorie and macro insights against personal targets,
rolled up by day, week, and month.

It runs on the database already built: **`foods`** (528 raw ingredients, IFCT 2017)
and **`cooked_foods`** (1,014 cooked dishes, INDB), local-first SQLite with FTS5
search. Calorie math always resolves the chosen measure → grams → the per-100g
basis (see §8), so logged values are consistent regardless of which household
measure the user picks.

**Problem it solves.** Global trackers handle Indian food poorly — they miss
regional dishes, mis-estimate ghee/oil-heavy portions, and force ingredient-level
logging for composite dishes. And the universal failure mode of calorie apps is
logging friction: people quit because each meal takes too many taps. This app
targets both — Indian-native data and a low-friction log path.

**Scale assumption [added]:** single-user, on-device, offline-capable. No accounts
or cloud sync in v1. Flagged in §9 — if this is multi-user, the data model and auth
change materially.

---

## 2. Goals & success metrics

**Product goals**
1. Make logging an Indian meal fast enough that the user does it daily.
2. Give a clear, honest read on whether the user is hitting their nutrition targets.
3. Stay accurate where it matters (calories, protein) without pretending to a
   precision the source data doesn't support.

**Success metrics [added]**

| Metric | Why it matters | Starting target |
|---|---|---|
| Time-to-log a known dish | Friction is the #1 churn driver | ≤ 10s, ≤ 4 taps from home |
| D1 activation (logged ≥1 entry) | Did onboarding lead anywhere | — |
| D7 logging retention | The only metric that proves the loop works | — |
| Days/week with a complete log | Data quality for insights | — |

(Targets are placeholders — set real numbers once there's a baseline.)

---

## 3. Users & assumptions

- **Primary user:** an individual tracking calories/macros, eating mostly Indian
  food, comfortable with a phone but not wanting a spreadsheet.
- **Assumptions:** the bundled DB is the food source of truth; the user accepts
  approximate portions; one user per install; phone is the only client.

---

## 4. Scope

**In scope (v1)**
- Onboarding → personal profile → calorie & macro targets
- Home: insights for day (primary), week, month
- Daily diary with 4 meals and date navigation
- Log a dish: search → pick → measure → quantity → save
- Edit / delete / move a logged entry
- "Recently logged" quick-add (friction reducer)
- Custom-food quick-add when a dish isn't in the DB
- **Meal planning** — schedule meals to future dates, confirm-to-log (core in v1; templating in v1.1)

**Out of scope / non-goals (v1) [added]**
- Barcode scanning (no barcode data in the DB)
- Photo/AI dish recognition
- Exercise / calories-burned / "calories out"
- Water, weight-trend charts, reminders/notifications (candidates for v1.1)
- Build-a-dish-from-ingredients (the compute-and-cache path — v2)
- Multi-user, accounts, cloud sync
- Micronutrient deep-dives beyond the few surfaced in insights

---

## 5. Information architecture (screen map)

```
Onboarding (first run only)
   └─ Profile → Targets → done

Home  (insights + Add Entry)
   └─ Add Entry ─────────────► Diary / Day screen
                                  (date + 4 meals, each with Add)
                                  ┌ date can be TODAY, PAST, or FUTURE
                                  │   • future date  → entries saved as "planned"
                                  │   • planned entry → Confirm ("Ate it") flips it to "logged"
                                     └─ Add on a meal ──► Log Food screen
                                                            (search dish → measure → qty → Save)
                                     └─ tap an entry ───► Edit Entry
   └─ (entry can also be reached to edit/delete from the Diary)
   └─ [v1.1] Week view ──────► plan/empty days at a glance, alt entry to the Diary
```

Three core screens (Home, Diary, Log Food) plus Onboarding, Edit Entry, and the
Custom-food sheet. Meal planning adds no new core screen — it reuses the Diary and
Log Food on a future date (§6.7).

---

## 6. Detailed requirements

### 6.0 Onboarding & targets  **[added — the load-bearing gap]**

Runs once on first launch; re-accessible from Settings.

- **ONB-1** Collect: sex, age (or DOB), height, current weight, activity level
  (sedentary → very active), goal (lose / maintain / gain).
- **ONB-2** Compute a daily **calorie target** and **macro targets** from the
  profile (method in §8). Show the computed numbers.
- **ONB-3** Let the user **override** any target manually. Manual values win and
  are stored as-is.
- **ONB-4** Targets are editable later and apply going forward; they do **not**
  retroactively change past days' insights.
- **ONB-5** Until targets exist, Home shows logged totals only, with a clear
  "Set your targets" prompt (insights need a denominator).

### 6.1 Home — insights

- **HOME-1 [brief]** Show nutrient insights for **today** at the top, then
  **this week**, then **this month**, in that vertical order.
- **HOME-2 [added]** *Today* block shows: calories consumed vs target (the hero
  number), plus protein / carb / fat against target (rings or bars), and a
  per-meal calorie split (breakfast/lunch/snack/dinner).
- **HOME-3 [added]** *Week* block: average daily calories vs target, protein
  adherence, and a 7-day calorie trend (bar or line). "Days on target" count.
- **HOME-4 [added]** *Month* block: same shape as week over ~30 days, trend-first.
- **HOME-5 [added]** Default surfaced nutrients: **calories, protein, carbs, fat**
  (primary) and **fibre + sodium** (secondary — both relevant to Indian diets and
  present in the data; sodium only available for `cooked_foods`). Final set is an
  open decision (§9).
- **HOME-6 [brief]** A persistent **Add Entry** button, bottom-center.
- **HOME-7 [added]** Empty/partial states: new user with no data shows "Log your
  first meal," not empty charts; week/month with <7/<30 days of data render the
  partial range and label it as partial.

### 6.2 Diary / Day screen  (your "Add Entry" screen)

This screen *is* the day's food diary, not just an add form — name it accordingly.

- **DIARY-1 [brief]** Show the **date** at the top, with a control to **change it**
  (prev/next day + date picker). Defaults to today.
- **DIARY-2 [brief]** Show four meal sections in order: **Breakfast, Lunch,
  Evening Snack, Dinner**, each with an **Add** action.
- **DIARY-3 [added]** Each meal section lists the entries already logged to it for
  that date (dish, portion, kcal) and a per-meal calorie subtotal.
- **DIARY-4 [added]** A day total (calories + macros vs target) is visible on this
  screen too, so the user doesn't have to bounce to Home.
- **DIARY-5 [added]** Tapping **Add** on a meal opens the Log Food screen with that
  meal and the current date pre-filled.
- **DIARY-6 [added]** Tapping an existing entry opens Edit Entry (§6.4).
- **DIARY-7 [added]** Empty meal sections show a light "Add breakfast/lunch/…"
  affordance rather than blank space.

### 6.3 Log Food screen  (dish + quantity)

The friction-critical screen. This is where the measure→grams→kcal design from the
data work pays off.

- **LOG-1 [brief]** User can **search and select a dish**, and **set a quantity**.
- **LOG-2 [added]** Search uses the DB's FTS5 index via `search_all()` — cooked
  dishes ranked first (what users usually log), raw ingredients after. Prefix
  matching ("masala dos" → results). Show name, source (cooked vs raw), and
  calorie density in each result row.
- **LOG-3 [added]** Above search, show **Recently logged** (last N distinct foods)
  for one-tap re-add. This is the single biggest friction win; keep it in v1.
- **LOG-4 [added]** On selecting a dish, present a **measure picker** populated from
  the `measures` table for that food, plus a **quantity** field. Default to the
  food's default measure × 1.
- **LOG-5 [added]** Live-preview the computed **calories + macros** for the chosen
  measure × quantity *before* saving, so the user sees the impact.
- **LOG-6 [added]** Grams is always an available measure for every food. For
  `cooked_foods`, the INDB serving unit is offered too — but per §8/§9, compute on
  the per-100g basis and treat any serving whose implied weight is flagged
  (`qa_note`) as a suggestion, not ground truth.
- **LOG-7 [added]** Save writes a snapshot entry (§7) to the selected meal + date,
  then returns to the Diary.
- **LOG-8 [added]** "Can't find it?" entry point → Custom-food sheet (§6.5).

### 6.4 Edit / delete entry  **[added]**

- **EDIT-1** Change dish, measure, quantity, meal, or date of a logged entry.
- **EDIT-2** Delete an entry.
- **EDIT-3** Editing recomputes and re-snapshots the entry's stored nutrition.
- **EDIT-4** Changing the date or meal moves the entry; insights for both the old
  and new day update.

### 6.5 Custom food (escape hatch)  **[added]**

The DB has 1,542 foods, not infinite — there must be a path when a dish is missing.

- **CUST-1** Quick-add a custom food: name + calories (required), protein/fat/carb
  (optional), and a default measure/weight.
- **CUST-2** Saved custom foods are reusable and appear in search alongside DB foods.
- **CUST-3** (v2) Build a dish from `foods` ingredients + grams; calories are
  conserved in cooking, so dish kcal = Σ ingredient kcal — then cache it as a
  reusable cooked food.

### 6.6 Cross-cutting states  **[added]**

- Loading, no-results (with custom-add CTA), and offline behavior (local DB → fully
  functional offline) defined for each screen.

### 6.7 Meal planning  **[added]**

Planning is logging shifted into the future. A planned meal is a `log_entries` row
with `status = planned` and a future `log_date` (Option A — see §9). It reuses the
entire log + insights stack; the only new surface area is a status flag, future
dates, and a confirm action.

- **PLAN-1** Plan to a future date. From the Diary (DIARY-1), navigate to any future
  date and add meals exactly as logging — same Log Food screen, same
  search/measure/quantity. Entries on a future date are saved with `status = planned`.
- **PLAN-2** Visual distinction. Planned entries are visually distinct from eaten
  entries in the Diary (e.g. outlined + a "Planned" tag).
- **PLAN-3** Plan-vs-target preview. Insights for a future date show planned totals
  against target (reuses HOME-2 / §8 math), labelled as a plan — so the user can land
  tomorrow's calories and macros *before* eating.
- **PLAN-4** Confirm to log. When a planned date is today or past, each planned entry
  can be confirmed ("Ate it"), flipping `planned → logged`. Provide one-tap
  "Confirm all" per meal and per day to keep friction low.
- **PLAN-5** Edit on confirm. If reality differed, the user edits the entry
  (dish/measure/quantity) at or after confirming; editing a still-planned entry is
  ordinary edit (EDIT-1).
- **PLAN-6** Drop a plan. Deleting a planned entry removes it (plan changed / didn't
  eat it).
- **PLAN-7** Intake counts only what's eaten *(the rule that keeps data honest)*.
  Insights count only `logged` entries as **consumed**. `planned` entries — whether
  future, or past-but-unconfirmed — are shown as plan/projection and **never** counted
  as actual intake. An unconfirmed past plan is not "eaten"; it stays a plan until
  confirmed, edited, or deleted.
- **PLAN-8** Today = actual + projection. On Home/Diary for today, the consumed figure
  reflects confirmed entries only; planned-but-unconfirmed entries for the rest of the
  day render as a lighter "planned" overlay, so the user sees a projected end-of-day
  total without it inflating "consumed."

**Templating — the payoff for repeat users (v1.1):**
- **PLAN-9** Copy a day's meals to another date or across a date range.
- **PLAN-10** Save a day as a reusable template ("Usual weekday") and apply it to any
  date(s).
- **PLAN-11** Week-at-a-glance view showing planned vs open days, as an alternative
  entry point to forward-navigation. (Optional; the forward-nav Diary covers the MVP.)

Dependency: a plan is only meaningful against a target, so this leans on §9
decision #1. Plan with no target is just a food to-do list.

---

## 7. Data model  **[added]**

Two new tables on top of the existing `foods` / `cooked_foods` / `measures`.

**`user_profile`** — sex, age/dob, height_cm, weight_kg, activity_level, goal,
target_kcal, target_protein_g, target_carb_g, target_fat_g, targets_source
(`computed` | `manual`).

**`log_entries`** — the diary.

| Column | Notes |
|---|---|
| id | PK |
| log_date | the day the food counts toward; **future dates allowed** (meal planning, §6.7) |
| meal_type | enum: breakfast / lunch / snack / dinner |
| status | enum: `planned` \| `logged`. `logged` = eaten, counts as intake; `planned` = scheduled, confirm to flip (§6.7) |
| food_code, food_table | which food, and which table (`foods` \| `cooked_foods` \| `custom`) |
| food_name | **snapshot** of the name at log time |
| measure_name, quantity, grams_total | what the user chose + resolved grams |
| kcal, protein_g, fat_g, carb_g, fibre_g | **snapshot** of computed nutrition |
| created_at, updated_at | |

**Key decision — snapshot, don't recompute.** Store the computed nutrition *into*
each `log_entries` row rather than recomputing from `food_code` at read time.
Rationale: (1) correcting a food later (e.g. the N001 chicken typo) must not
silently rewrite yesterday's history; (2) insights are a fast `SUM` with no joins;
(3) custom/edited foods just work. Cost: denormalized and must re-snapshot on edit.
For a personal tracker, snapshot wins.

**Insights filter on `status`.** *Consumed* totals (Home/Diary, §6.1) sum only
`status = logged`. Planned entries are summed separately for the plan-vs-target
preview (PLAN-3) and never counted as actual intake (PLAN-7).

**`custom_foods`** — user-added foods (CUST-1), same shape as the shared core
columns so search and logging treat them uniformly.

**`day_templates`** *(v1.1 — for save-as-template, PLAN-10)* — a named set of
{meal_type, food_code/table, measure, quantity} rows that can be stamped onto any
date. Copy-a-day (PLAN-9) needs no new table — it just duplicates `log_entries` rows
to the new dates with `status = planned`.

---

## 8. Calculations  **[added]**

**Logging a portion** (works for every food, both tables):
```
grams_total = quantity × grams_per_unit        -- from the measures table
kcal        = energy_kcal × grams_total / 100   -- per-100g basis (the trustworthy one)
```
Macros use the same per-100g × grams formula. This is why the measure picker never
needs the unreliable `serving_*` columns for the actual math — they're at most a
default suggestion.

**Computing targets** (ONB-2). Recommended method, stated so it's decided:

- **BMR — Mifflin-St Jeor.** Best-validated general predictive equation for resting
  metabolic rate among the common ones (confidence: reasonably high for non-extreme
  body types; all such equations carry meaningful individual error).
  `BMR = 10·kg + 6.25·cm − 5·age + s` (s = +5 male, −161 female).
- **TDEE** = BMR × activity factor (≈1.2 sedentary → ≈1.9 very active).
- **Calorie target** = TDEE adjusted for goal. A ~500 kcal/day deficit is the
  conventional starting point for loss, *but* flag honestly: the "7,700 kcal ≈ 1 kg"
  rule over-predicts real long-term loss because the body adapts. Treat it as a
  starting estimate to be corrected against the user's actual trend, not a law.
- **Protein target** — anchor to body weight: ~1.6 g/kg is a well-supported baseline,
  ranging to ~2.2 g/kg for active users or those in a deficit (lean-mass
  preservation). Evidence here is relatively strong. Remaining calories split between
  carbs and fat by preference.

---

## 9. Open decisions (yours to make)

1. **Targets: computed or manual?** *(the big one — everything in §6.1 hangs on it)*
   Recommend computed-via-Mifflin-St-Jeor with a manual override (ONB-2/3). The
   alternative — manual-only — is simpler to build but worse onboarding.
2. **Measure weights: standardized or per-dish?** From the prior discussion.
   Standardized (a katori ≈ 150 g regardless of dish, NIN household-measure weights)
   sidesteps INDB's ~4% broken serving sizes and is the only thing that gives raw
   ingredients household measures at all. Recommend standardized for v1.
3. **The global Add Entry button (HOME-6): meal-first or meal-agnostic?** As
   specced, it lands on the Diary, then the user picks a meal (2 taps to search).
   Alternative: jump straight to Log Food and infer the meal from time of day
   (fewer taps). Friction trade-off — worth a quick call.
4. **Surfaced nutrients (HOME-5).** Calories + 3 macros is the safe default. Adding
   fibre and sodium is cheap and Indian-diet-relevant, but sodium is missing for raw
   `foods`. Decide the v1 set.
5. **Single-user/local vs accounts/sync.** Assumed local. If you want cross-device,
   that's a v1 architecture decision, not a later add-on.
6. **Meal-planning model: plan-as-future-log (A) or plan-vs-actual (B)?**
   *Resolved → A* per discussion: planned meals are future-dated `log_entries` with
   `status = planned`, confirmed into intake (§6.7). A reuses the whole stack and adds
   just a confirm step. B — a separate `planned_entries` table that measures adherence
   between plan and what was actually eaten — buys plan-vs-behavior analytics at the
   cost of a parallel data model and double logging. Revisit only if adherence-as-a-
   metric becomes a goal.

---

## 10. Phasing

- **v1 (MVP):** §6.0–6.7 — onboarding+targets, home insights, diary, log with
  search/measure/quantity + snapshot, edit/delete, recents, custom quick-add, and
  meal planning core (future dates + confirm-to-log, PLAN-1–8).
- **v1.1:** weight tracking + trend, richer week/month charts, favorites, reminders,
  and planning templates (copy-a-day, save-template, week view — PLAN-9–11).
- **v2:** build-a-dish-from-ingredients (compute-and-cache), photo/AI logging,
  exercise / calories-out.
