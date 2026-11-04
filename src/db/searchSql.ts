/**
 * Food search — pure query builders + SQL (single source of truth, M1).
 *
 * Imported by the expo-sqlite wrapper (src/db/search.ts) AND the headless verifier
 * (scripts/verify_m1.mjs), so the searched-and-ranked SQL is identical in both. The
 * FTS5 tables (foods_fts, cooked_foods_fts) ship in the bundled DB (M0).
 *
 * Strategy: prefix-match every term (LOG-2). User input is sanitized to alnum tokens
 * and each becomes a quoted FTS5 prefix (`"masala"* "dos"*`) — quoting keeps stray
 * punctuation from becoming FTS5 operators. If FTS5 is unavailable, the same tokens
 * drive a LIKE fallback.
 */

import type { FoodTable } from '@/types/db';

export type FoodKind = 'cooked' | 'raw' | 'custom';

/** Map a search result kind to its log_entries.food_table value (and back). */
export function kindToTable(kind: FoodKind): FoodTable {
  return kind === 'cooked' ? 'cooked_foods' : kind === 'raw' ? 'foods' : 'custom';
}
export function tableToKind(table: FoodTable): FoodKind {
  return table === 'cooked_foods' ? 'cooked' : table === 'foods' ? 'raw' : 'custom';
}

export interface SearchResult {
  code: string;
  name: string;
  kind: FoodKind;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fibre_g: number | null;
  sodium_mg: number | null; // cooked dishes only; null for raw ingredients
}

export const DEFAULT_LIMIT = 50;

/** Split a query into lowercase alphanumeric tokens (drops punctuation entirely). */
export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** FTS5 MATCH expression: prefix-match + AND every term. null when query is empty. */
export function buildFtsMatch(q: string): string | null {
  const terms = tokenize(q);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' ');
}

/** LIKE patterns (`%term%`) for the fallback path. Empty when query is empty. */
export function buildLikeTerms(q: string): string[] {
  return tokenize(q).map((t) => `%${t}%`);
}

// Column lists reference only the base-table alias (c / f), so the exact same
// projection is reused by the FTS path (which joins the *_fts table) and the LIKE
// path (which queries the base table directly). Shapes match SearchResult.
const COOKED_COLS =
  `c.food_code AS code, c.food_name AS name, 'cooked' AS kind,
   c.energy_kcal, c.protein_g, c.fat_g, c.carb_g, c.fibre_g, c.sodium_mg`;
const RAW_COLS =
  `f.code AS code, f.name AS name, 'raw' AS kind,
   f.energy_kcal, f.protein_g, f.fat_g, f.carb_g, f.fibre_g, NULL AS sodium_mg`;
const CUSTOM_COLS =
  `cf.code AS code, cf.name AS name, 'custom' AS kind,
   cf.energy_kcal, cf.protein_g, cf.fat_g, cf.carb_g, cf.fibre_g, cf.sodium_mg`;

// ---- FTS5 path (ORDER BY rank => best bm25 match first) -------------------
export const SEARCH_COOKED_FTS =
  `SELECT ${COOKED_COLS}
     FROM cooked_foods_fts ft
     JOIN cooked_foods c ON c.food_code = ft.food_code
    WHERE cooked_foods_fts MATCH ?
    ORDER BY rank
    LIMIT ?`;

export const SEARCH_RAW_FTS =
  `SELECT ${RAW_COLS}
     FROM foods_fts ft
     JOIN foods f ON f.code = ft.code
    WHERE foods_fts MATCH ?
    ORDER BY rank
    LIMIT ?`;

// ---- Custom foods (user-added; no FTS, always LIKE) ----------------------
/** Build the LIKE query for custom_foods, AND-ing one `name LIKE ?` per term. */
export function buildCustomLikeSql(termCount: number): string {
  const where = Array(Math.max(1, termCount)).fill('cf.name LIKE ?').join(' AND ');
  return `SELECT ${CUSTOM_COLS} FROM custom_foods cf
           WHERE ${where} ORDER BY cf.name LIMIT ?`;
}

// ---- LIKE fallback path (no FTS5 available) ------------------------------
/** Build a LIKE-fallback query AND-ing one `name LIKE ?` per term. */
export function buildLikeSql(kind: FoodKind, termCount: number): string {
  const n = Math.max(1, termCount);
  if (kind === 'custom') return buildCustomLikeSql(n);
  if (kind === 'cooked') {
    const where = Array(n).fill('c.food_name LIKE ?').join(' AND ');
    return `SELECT ${COOKED_COLS} FROM cooked_foods c
             WHERE ${where} ORDER BY c.food_name LIMIT ?`;
  }
  const where = Array(n).fill('f.name LIKE ?').join(' AND ');
  return `SELECT ${RAW_COLS} FROM foods f
           WHERE ${where} ORDER BY f.name LIMIT ?`;
}

// ---- relevance ranking (both platforms) -----------------------------------
/**
 * How well a name matches the query, in tiers far enough apart (≥20) that a history boost
 * (≤15) only reorders foods WITHIN a tier — a dish you log often can rise above other
 * equally good matches, but never above a better match:
 *   100 exact name · 80 starts with the query · 60 every term starts a word
 *    40 the first term starts a word · 10 the terms only appear inside words
 * The web LIKE path matches inside words ("tea" in "steamed"), so this is what keeps
 * "Hot tea" above "Caramel custard (steamed)".
 */
export function matchTier(name: string, q: string): number {
  const terms = tokenize(q);
  if (terms.length === 0) return 0;
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
  const n = norm(name);
  const main = norm(name.split('(')[0]); // without the "(Hindi name)" alias
  const phrase = terms.join(' ');
  if (n === phrase || main === phrase) return 100;
  if (n.startsWith(phrase)) return 80;
  const startsWord = (t: string) => new RegExp(`(^|\\s)${t}`).test(n);
  if (terms.every(startsWord)) return 60;
  if (startsWord(terms[0])) return 40;
  return 10;
}

/** Key used for per-food boosts: `${food_table}:${code}` (log_entries' naming). */
export function boostKey(kind: FoodKind, code: string): string {
  return `${kindToTable(kind)}:${code}`;
}

/**
 * Re-rank search results by match tier, then by boost (foods you've logged or starred),
 * then by shorter name (ignoring any "(…)" alias), keeping the incoming order as the
 * final tie-break. `boosts` maps boostKey → 0..15.
 */
export function rankResults(
  results: SearchResult[],
  q: string,
  boosts: ReadonlyMap<string, number> = new Map()
): SearchResult[] {
  const len = (s: string) => s.split(' (')[0].length;
  return results
    .map((r, i) => ({
      r,
      i,
      score: matchTier(r.name, q) + Math.min(15, boosts.get(boostKey(r.kind, r.code)) ?? 0),
    }))
    .sort((a, b) => b.score - a.score || len(a.r.name) - len(b.r.name) || a.i - b.i)
    .map((x) => x.r);
}

/** How often each food has been logged (any status), for the search history boost. */
export const LOGGED_FOOD_COUNTS = `
  SELECT food_table, food_code, COUNT(*) AS n
    FROM log_entries
   WHERE food_code IS NOT NULL
   GROUP BY food_table, food_code`;

/** History boost: 8 for anything logged before, up to 12 for a regular. */
export function historyBoost(timesLogged: number): number {
  if (timesLogged <= 0) return 0;
  return Math.min(12, 8 + Math.floor(Math.log2(timesLogged)));
}

// ---- getByCode -----------------------------------------------------------
export const GET_COOKED_BY_CODE = `SELECT ${COOKED_COLS} FROM cooked_foods c WHERE c.food_code = ?`;
export const GET_RAW_BY_CODE = `SELECT ${RAW_COLS} FROM foods f WHERE f.code = ?`;
export const GET_CUSTOM_BY_CODE = `SELECT ${CUSTOM_COLS} FROM custom_foods cf WHERE cf.code = ?`;
