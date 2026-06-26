/**
 * Food search/data access (M1, LOG-2) — fully local. Runs the shared queries from
 * ./searchSql against the on-device DB, transparently falling back from FTS5 to LIKE
 * when the M0 probe found FTS5 unavailable. Reference foods (cooked/raw) and the user's
 * custom foods all live on-device now, so search is instant and offline — no network.
 */
import { getDatabase, isFtsAvailable } from './database';
import {
  buildCustomLikeSql,
  buildFtsMatch,
  buildLikeSql,
  buildLikeTerms,
  DEFAULT_LIMIT,
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

/**
 * Unified search: the user's own custom foods first, then cooked dishes (what users
 * usually log), then raw ingredients (LOG-2, CUST-2). Each group is ranked internally.
 */
export async function searchAll(q: string, limitPerKind = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const [custom, reference] = await Promise.all([
    searchCustom(q, limitPerKind),
    searchReference(q, limitPerKind),
  ]);
  return [...custom, ...reference];
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
