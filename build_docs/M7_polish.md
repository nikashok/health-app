# M7 — Integration & polish

**Goal:** a coherent, offline v1 with no dead ends.

## Tasks
- Wire all navigation end-to-end (Home <-> Diary <-> Log <-> Edit; Add Entry button).
- Empty/error states across every screen (loading, no-results with custom-add CTA).
- Offline check: airplane mode -> fully functional (local DB).
- Basic input validation (quantities, profile fields).
- Run the unit + invariant tests green.

## Acceptance
Full flow onboarding -> log -> plan -> confirm -> insights works **offline**, with no
dead ends; tests pass.
