/**
 * Display names. IFCT raw-ingredient names end in a Latin binomial — "Bajra (Pennisetum
 * typhoideum)" — which is noise when choosing what you ate. Only raw ingredients are
 * trimmed: INDB dish names use the same "(Capitalised words)" shape for their Hindi names
 * ("Boiled rice (Uble chawal)"), which must stay. Display only — the stored name (and
 * every snapshot) is untouched.
 */
import type { FoodTable } from '@/types/db';

import type { FoodKind } from '@/db/searchSql';

/** "(Genus species)", "(Musa x paradisiaca)", "(Oryza sativa )" at the end of a name. */
const BINOMIAL = /\s*\(([A-Z][a-z]+(?:\s+(?:x|×|var\.|subsp\.|spp?\.)?\s*[a-z][a-z.-]*)+)\s*\)\s*$/;

export function displayFoodName(name: string, source: FoodKind | FoodTable): string {
  if (source !== 'raw' && source !== 'foods') return name;
  const trimmed = name.replace(BINOMIAL, '').trim();
  return trimmed.length > 0 ? trimmed : name;
}
