# M1 — Search + data access (LOG-2)

**Goal:** working food search over both tables.

## Tasks
Port the FTS5 search from the provided `food_search.py`:
- `searchAll(q)` — cooked dishes first, then raw ingredients
- `searchCooked(q)`, `searchRaw(q)`, `getByCode(code)`
- Prefix-match every term: `"masala dos"` -> `masala* dos*`
- Return: code, name, kind (cooked|raw), energy_kcal, macros.
Add a throwaway debug screen to exercise it.

## Acceptance
"dosa" returns ranked dishes with kcal/100g; "mango" returns raw fruit;
multi-word "masala dos" works. (If FTS5 unavailable, LIKE fallback returns results.)
