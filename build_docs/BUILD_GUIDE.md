# Build Guide — v1 (entry point)

Companion to `PRD_nutrition_tracker.md` (the *what*). This is the *how*.

## Driving Claude Code (read this first)
- Build **one milestone at a time, in order** (M0 → M7).
- Each session, reference files by PATH — do not paste docs into the prompt:
  > "Read build_docs/M3_log_food.md. Implement it. Stop when the acceptance check passes."
- Keep only `CLAUDE.md` auto-loaded (small, persistent). Milestone files are pulled
  in on demand.
- `/loop` is fine per milestone; use the acceptance check as the loop exit condition.

## Stack (assumption — overrule if wrong)
Expo (React Native) + TypeScript + expo-sqlite, target iOS/Android. Chosen because the
PRD mandates offline / local / single-user / no-backend, which a server stack breaks.
Bonus: Expo can also produce a web build for demos (the SQLite layer differs on web;
native is the real target). If a pure web app is wanted instead, the data layer
changes — stop and revise before building.

## Libraries (lean)
Expo Router (nav), expo-sqlite + expo-asset + expo-file-system (DB), Zustand (state),
react-native-gifted-charts (rings/bars/trend), dayjs (dates). Nothing else unless a
milestone needs it. No ORM, no Redux, no backend.

## Project structure
```
/app  (Expo Router)   /onboarding  /(tabs)/index.tsx=Home  /diary  /log  /edit
/src  /db  /calc  /state  /components  /types
/assets/db/ifct2017.db   (provided)
```

## Milestones (each is a separate file in build_docs/)
- M0  Scaffold + data layer            -> M0_data_setup.md   (do this carefully; all sits on it)
- M1  Search + data access             -> M1_search.md
- M2  Onboarding + targets             -> M2_onboarding.md
- M3  Log Food screen                  -> M3_log_food.md
- M4  Diary / Day screen               -> M4_diary.md
- M5  Home / insights                  -> M5_home.md
- M6  Meal planning                    -> M6_planning.md
- M7  Integration & polish             -> M7_polish.md

## Out of scope — DO NOT build in v1
Planning templates (copy-day/save-template/week view), weight tracking, favorites,
reminders, build-from-ingredients, photo/AI, exercise/"calories out", backend,
accounts, sync, barcode. If it's on this list, leave `// TODO v1.1:` and move on.

## Testing
Unit-test `/src/calc` (assert the 246.9 kcal dosa case; Mifflin-St Jeor vs a hand
calc). Invariant tests: snapshot stays fixed after source edit; insights exclude
`planned`. Per-milestone smoke test = that milestone's acceptance check.
