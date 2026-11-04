/**
 * Favourite foods — local-first, backed up like everything else (sync.ts, migration
 * 0004). A favourite is just a pointer to a food (table + code) plus a display name;
 * logging one always goes through quickLog/logFood, so nutrition is snapshotted fresh.
 */
import type { FoodTable } from '@/types/db';

import { getDatabase } from './database';
import { DELETE_FAVORITE, favKey, INSERT_FAVORITE, IS_FAVORITE, LIST_FAVORITES } from './favoritesSql';
import { kindToTable, type SearchResult } from './searchSql';
import { enqueue, scheduleDrain } from './sync';

export interface FavoriteFood {
  fav_key: string;
  food_table: FoodTable;
  food_code: string;
  food_name: string;
  created_at: string;
  /** How it was last logged, if ever (null → open Log Entry to choose a portion). */
  measure_name: string | null;
  quantity: number | null;
  kcal: number | null;
}

export function listFavorites(): Promise<FavoriteFood[]> {
  return getDatabase().getAllAsync<FavoriteFood>(LIST_FAVORITES);
}

export async function isFavorite(food: Pick<SearchResult, 'kind' | 'code'>): Promise<boolean> {
  const row = await getDatabase().getFirstAsync<{ yes: number }>(
    IS_FAVORITE,
    favKey(kindToTable(food.kind), food.code)
  );
  return !!row;
}

/** Star or unstar a food; returns the new state. The outbox write shares the transaction. */
export async function setFavorite(food: SearchResult, on: boolean): Promise<boolean> {
  const db = getDatabase();
  const table = kindToTable(food.kind);
  const key = favKey(table, food.code);
  await db.withTransactionAsync(async () => {
    if (on) await db.runAsync(INSERT_FAVORITE, key, table, food.code, food.name, new Date().toISOString());
    else await db.runAsync(DELETE_FAVORITE, key);
    await enqueue(db, 'favorite_foods', key);
  });
  scheduleDrain();
  return on;
}
