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

// ---- getByCode -----------------------------------------------------------
export const GET_COOKED_BY_CODE = `SELECT ${COOKED_COLS} FROM cooked_foods c WHERE c.food_code = ?`;
export const GET_RAW_BY_CODE = `SELECT ${RAW_COLS} FROM foods f WHERE f.code = ?`;
export const GET_CUSTOM_BY_CODE = `SELECT ${CUSTOM_COLS} FROM custom_foods cf WHERE cf.code = ?`;
