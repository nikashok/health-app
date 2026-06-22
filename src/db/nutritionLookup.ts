/**
 * Client for the AI nutrition lookup (api/lookup.ts on Vercel). Sends a food name +
 * the signed-in user's Supabase access token; gets back per-100g nutrition for the
 * custom-food form to pre-fill. The user always reviews before saving.
 *
 * The endpoint is the deployed Vercel function. An absolute URL works on both web
 * (same origin) and native; override with EXPO_PUBLIC_LOOKUP_URL for other deploys.
 */
import { supabase } from './supabase';

const LOOKUP_URL =
  process.env.EXPO_PUBLIC_LOOKUP_URL ?? 'https://health-app-nikashok.vercel.app/api/lookup';

export interface NutritionLookup {
  name: string;
  energy_kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fibre_g: number;
  confidence: 'low' | 'medium' | 'high';
  basis_note: string;
  source: string;
  sane: boolean;
}

export class LookupError extends Error {}

/** Ask the server to estimate nutrition for `name`. Throws LookupError on failure. */
export async function lookupNutrition(name: string): Promise<NutritionLookup> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new LookupError('Not signed in');

  let res: Response;
  try {
    res = await fetch(LOOKUP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
  } catch {
    throw new LookupError('Could not reach the lookup service. Check your connection.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new LookupError(body?.error ?? `Lookup failed (${res.status})`);
  }
  return (await res.json()) as NutritionLookup;
}
