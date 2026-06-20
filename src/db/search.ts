/**
 * Food search/data access (M1, LOG-2).
 *
 * Reference foods (cooked_foods, foods) are searched against the on-device bundled
 * DB — fast, offline, FTS5 with a LIKE fallback. The user's CUSTOM foods live in
 * Supabase (synced across devices), so those are searched there and merged in. If
 * the network is unavailable the custom lookup degrades to empty, so reference
 * search still works fully offline.
 */
import { getDatabase, isFtsAvailable } from './database';
import {
  buildFtsMatch,
  buildLikeSql,
  buildLikeTerms,
  DEFAULT_LIMIT,
  GET_COOKED_BY_CODE,
  GET_RAW_BY_CODE,
  SEARCH_COOKED_FTS,
  SEARCH_RAW_FTS,
  tokenize,
  type FoodKind,
  type SearchResult,
} from './searchSql';
import { supabase } from './supabase';

export type { SearchResult, FoodKind } from './searchSql';

const CUSTOM_COLS = 'code, name, energy_kcal, protein_g, fat_g, carb_g, fibre_g, sodium_mg';

type CustomRow = {
  code: string;
  name: string;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fibre_g: number | null;
  sodium_mg: number | null;
};

function toResult(r: CustomRow): SearchResult {
  return { ...r, kind: 'custom' };
}

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

/** The signed-in user's custom foods matching `q` (Supabase; AND every term). Returns
 *  [] if offline so reference search still works. */
export async function searchCustom(q: string, limit = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const terms = tokenize(q);
  if (terms.length === 0) return [];
  try {
    let query = supabase.from('custom_foods').select(CUSTOM_COLS).order('name').limit(limit);
    for (const t of terms) query = query.ilike('name', `%${t}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data as CustomRow[]).map(toResult);
  } catch (e) {
    console.warn('[search] custom-food lookup failed (offline?)', e);
    return [];
  }
}

/**
 * Unified search: the user's own custom foods first, then cooked dishes (what users
 * usually log), then raw ingredients (LOG-2, CUST-2). Each group is ranked internally.
 */
export async function searchAll(q: string, limitPerKind = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const [custom, cooked, raw] = await Promise.all([
    searchCustom(q, limitPerKind),
    searchCooked(q, limitPerKind),
    searchRaw(q, limitPerKind),
  ]);
  return [...custom, ...cooked, ...raw];
}

/** One custom food by code (Supabase), or null. */
async function getCustomByCode(code: string): Promise<SearchResult | null> {
  const { data, error } = await supabase
    .from('custom_foods')
    .select(CUSTOM_COLS)
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data ? toResult(data as CustomRow) : null;
}

/**
 * Look up a single food by code, checking cooked dishes first, then raw, then the
 * user's custom foods. Returns null if no match.
 */
export async function getByCode(code: string): Promise<SearchResult | null> {
  const db = getDatabase();
  const cooked = await db.getFirstAsync<SearchResult>(GET_COOKED_BY_CODE, code);
  if (cooked) return cooked;
  const raw = await db.getFirstAsync<SearchResult>(GET_RAW_BY_CODE, code);
  if (raw) return raw;
  return getCustomByCode(code);
}

/** Resolve a food by code within a known table — avoids cross-table code collisions. */
export async function getByCodeAndTable(
  code: string,
  table: FoodKind
): Promise<SearchResult | null> {
  if (table === 'custom') return getCustomByCode(code);
  const db = getDatabase();
  const sql = table === 'cooked' ? GET_COOKED_BY_CODE : GET_RAW_BY_CODE;
  const row = await db.getFirstAsync<SearchResult>(sql, code);
  return row ?? null;
}
