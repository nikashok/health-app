/**
 * Food search/data access (M1, LOG-2) — fully local. Runs the shared queries from
 * ./searchSql against the on-device DB, transparently falling back from FTS5 to LIKE
 * when the M0 probe found FTS5 unavailable. Reference foods (cooked/raw) and the user's
 * custom foods all live on-device now, so search is instant and offline — no network.
 */
import type { FoodTable } from '@/types/db';

import { getDatabase, isFtsAvailable } from './database';
import {
  boostKey,
  buildCustomLikeSql,
  buildFtsMatch,
  buildLikeSql,
  buildLikeTerms,
  DEFAULT_LIMIT,
  historyBoost,
  LOGGED_FOOD_COUNTS,
  rankResults,
  tableToKind,
  GET_COOKED_BY_CODE,
  GET_CUSTOM_BY_CODE,
  GET_RAW_BY_CODE,
  SEARCH_COOKED_FTS,
  SEARCH_RAW_FTS,
  type FoodKind,
  type SearchResult,
} from './searchSql';

export type { SearchResult, FoodKind } from './searchSql';

async function runSearch(
  kind: 'cooked' | 'raw',
  q: string,
  limit: number
): Promise<SearchResult[]> {
  const db = getDatabase();

  if (isFtsAvailable()) {
    const match = buildFtsMatch(q);
    if (!match) return [];
    const sql = kind === 'cooked' ? SEARCH_COOKED_FTS : SEARCH_RAW_FTS;
    return db.getAllAsync<SearchResult>(sql, match, limit);
  }

  // LIKE fallback (degraded search; M0 logged the downgrade).
  const terms = buildLikeTerms(q);
  if (terms.length === 0) return [];
  const sql = buildLikeSql(kind, terms.length);
  return db.getAllAsync<SearchResult>(sql, ...terms, limit);
}

/** Cooked dishes matching `q`, ranked best-first. */
export function searchCooked(q: string, limit = DEFAULT_LIMIT): Promise<SearchResult[]> {
  return runSearch('cooked', q, limit);
}

/** Raw IFCT ingredients matching `q`, ranked best-first. */
export function searchRaw(q: string, limit = DEFAULT_LIMIT): Promise<SearchResult[]> {
  return runSearch('raw', q, limit);
}

/** User-added custom foods matching `q` (always LIKE — no FTS index). */
export function searchCustom(q: string, limit = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const db = getDatabase();
  const terms = buildLikeTerms(q);
  if (terms.length === 0) return Promise.resolve([]);
  return db.getAllAsync<SearchResult>(buildCustomLikeSql(terms.length), ...terms, limit);
}

/** Reference foods (cooked + raw) — both local, run together. */
export async function searchReference(
  q: string,
  limitPerKind = DEFAULT_LIMIT
): Promise<SearchResult[]> {
  const [cooked, raw] = await Promise.all([
    searchCooked(q, limitPerKind),
    searchRaw(q, limitPerKind),
  ]);
  return [...cooked, ...raw];
}

/** The LIKE fallback can't rank, so it fetches a wider pool for rankResults to order. */
const LIKE_POOL = 200;

/**
 * Unified search over custom foods, cooked dishes and raw ingredients (LOG-2, CUST-2),
 * ranked by how well each name matches (rankResults) with foods you've logged or starred
 * moving up within a tier. Same ranking on native (FTS5) and web (LIKE).
 */
export async function searchAll(
  q: string,
  opts: { boosts?: ReadonlyMap<string, number>; limit?: number } = {}
): Promise<SearchResult[]> {
  const pool = isFtsAvailable() ? DEFAULT_LIMIT : LIKE_POOL;
  const [custom, reference] = await Promise.all([searchCustom(q, pool), searchReference(q, pool)]);
  return rankResults([...custom, ...reference], q, opts.boosts).slice(0, opts.limit ?? 60);
}

/**
 * Per-food search boosts from your history: boostKey → 0..12 (more logs, more boost).
 * Reads log_entries only to count — never for nutrition (CLAUDE.md rule 6).
 */
export async function getFoodBoosts(): Promise<Map<string, number>> {
  const rows = await getDatabase().getAllAsync<{ food_table: FoodTable; food_code: string; n: number }>(
    LOGGED_FOOD_COUNTS
  );
  return new Map(rows.map((r) => [boostKey(tableToKind(r.food_table), r.food_code), historyBoost(r.n)]));
}

/** A dish's own default serving ("1 bowl" = 200 g), for "≈ kcal per serving" in results. */
export interface OwnServing {
  measure_name: string;
  grams_per_unit: number;
}

/** Own default servings for a batch of food codes (cooked dishes carry them). */
export async function getOwnServings(codes: string[]): Promise<Map<string, OwnServing>> {
  if (codes.length === 0) return new Map();
  const rows = await getDatabase().getAllAsync<OwnServing & { food_code: string }>(
    `SELECT food_code, measure_name, grams_per_unit FROM measures
      WHERE is_default = 1 AND food_code IN (${codes.map(() => '?').join(',')})`,
    ...codes
  );
  return new Map(rows.map((r) => [r.food_code, { measure_name: r.measure_name, grams_per_unit: r.grams_per_unit }]));
}

/**
 * Look up a single food by code, checking cooked dishes first, then raw, then custom.
 * Returns null if no match.
 */
export async function getByCode(code: string): Promise<SearchResult | null> {
  const db = getDatabase();
  const cooked = await db.getFirstAsync<SearchResult>(GET_COOKED_BY_CODE, code);
  if (cooked) return cooked;
  const raw = await db.getFirstAsync<SearchResult>(GET_RAW_BY_CODE, code);
  if (raw) return raw;
  const custom = await db.getFirstAsync<SearchResult>(GET_CUSTOM_BY_CODE, code);
  return custom ?? null;
}

/** Resolve a food by code within a known table — avoids cross-table code collisions. */
export async function getByCodeAndTable(
  code: string,
  table: FoodKind
): Promise<SearchResult | null> {
  const db = getDatabase();
  const sql =
    table === 'cooked'
      ? GET_COOKED_BY_CODE
      : table === 'custom'
        ? GET_CUSTOM_BY_CODE
        : GET_RAW_BY_CODE;
  const row = await db.getFirstAsync<SearchResult>(sql, code);
  return row ?? null;
}
