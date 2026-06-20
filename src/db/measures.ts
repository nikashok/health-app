/**
 * Measure access (M3). Returns the composed, default-first list of measures a food can
 * be logged in. See measuresSql.ts for the composition rules.
 */
import { getDatabase } from './database';
import {
  composeMeasures,
  MEASURES_FOR_FOOD,
  type CustomDefaultMeasure,
  type MeasureOption,
  type RawMeasure,
} from './measuresSql';

export type { MeasureOption } from './measuresSql';

/**
 * Measures for a food: its own + globals + grams, default first. `foodCode` is the
 * food's code (only cooked dishes have their own rows); pass `customDefault` for a
 * custom food's stored default measure.
 */
export async function getMeasures(
  foodCode: string | null,
  customDefault?: CustomDefaultMeasure | null
): Promise<MeasureOption[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<RawMeasure>(MEASURES_FOR_FOOD, foodCode);
  return composeMeasures(rows, customDefault);
}
