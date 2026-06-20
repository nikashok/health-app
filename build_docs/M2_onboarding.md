# M2 — Onboarding + targets (ONB-1…5)

**Goal:** profile in, targets computed (and overridable), persisted.

## Tasks
1. Profile form: sex, age, height_cm, weight_kg, activity_level, goal.
2. Compute targets:
```
bmr = 10*kg + 6.25*cm - 5*age + (male? +5 : -161)   // Mifflin-St Jeor
tdee = bmr * activityFactor                           // 1.2 sedentary … 1.9 very active
calorieTarget = tdee adjusted for goal                // ~500 kcal deficit = a STARTING point only
proteinTarget_g = ~1.6–2.2 * kg                       // higher end for deficit/active
```
   (The 7700 kcal≈1 kg rule over-predicts long-term loss — treat as a starting
   estimate to correct against real trend.)
3. Show computed targets; allow **manual override** (override wins,
   `targets_source='manual'`); persist to `user_profile`.

## Acceptance
Complete onboarding -> targets stored; editing weight recomputes; manual override
persists and is flagged manual.
