/**
 * Vercel serverless function: AI nutrition lookup.
 *
 * The app sends a food name + the signed-in user's Supabase access token. We verify
 * the token (so this isn't an open endpoint burning OpenAI credits), ask OpenAI for
 * per-100g nutrition via Structured Outputs (guaranteed shape), sanity-check the
 * calories against the macros (Atwater), and return JSON the form pre-fills with.
 *
 * Secrets live here, never in the app bundle:
 *   OPENAI_API_KEY   (required)   — set in Vercel → Settings → Environment Variables
 *   OPENAI_MODEL     (optional)   — defaults to gpt-4o-mini
 *
 * This file is compiled by Vercel independently and is excluded from the app's
 * tsconfig, so it doesn't go through Metro/Expo.
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://evxwakgxbfwymvmyowic.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eHdha2d4YmZ3eW12bXlvd2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzMyODYsImV4cCI6MjA5NzU0OTI4Nn0.EMt2PK2Hvr1UL75xzBN0aSYnFOqxySlVhev84PWUxU4';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const NUTRITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    energy_kcal: { type: 'number', description: 'kcal per 100 g edible portion' },
    protein_g: { type: 'number', description: 'grams per 100 g' },
    carb_g: { type: 'number', description: 'grams per 100 g' },
    fat_g: { type: 'number', description: 'grams per 100 g' },
    fibre_g: { type: 'number', description: 'grams per 100 g' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    basis_note: {
      type: 'string',
      description: 'Cooked/raw assumption and how it was estimated, one short phrase',
    },
    source: {
      type: 'string',
      description: 'The most likely authoritative basis, e.g. "IFCT 2017", "USDA", "typical recipe estimate"',
    },
  },
  required: [
    'energy_kcal',
    'protein_g',
    'carb_g',
    'fat_g',
    'fibre_g',
    'confidence',
    'basis_note',
    'source',
  ],
} as const;

const SYSTEM_PROMPT = [
  'You are a nutrition database assistant for an Indian food tracker.',
  'Given a food name, return nutrition for the food AS COMMONLY PREPARED AND EATEN.',
  'ALL values must be PER 100 GRAMS of edible portion — never per serving.',
  'Prefer values consistent with standard food-composition tables (IFCT 2017 for',
  'Indian foods, USDA otherwise). For a homemade/composite dish, estimate from a',
  'typical recipe. State the cooked-vs-raw assumption in basis_note. Set confidence',
  'by how standardized the food is (high for staples, low for vague/homemade names).',
].join(' ');

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

/** Verify the Supabase access token belongs to a real logged-in user. */
async function verifyUser(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' });

  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!(await verifyUser(token))) return res.status(401).json({ error: 'Not signed in' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body ?? {};
  const name = String(body?.name ?? '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Provide a food name' });

  let data: any;
  try {
    const openai = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Food: ${name}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'nutrition', strict: true, schema: NUTRITION_SCHEMA },
        },
      }),
    });
    if (!openai.ok) {
      const detail = await openai.text();
      return res.status(502).json({ error: 'Lookup failed', detail: detail.slice(0, 300) });
    }
    const json = await openai.json();
    data = safeParse(json?.choices?.[0]?.message?.content ?? '');
  } catch (e) {
    return res.status(502).json({ error: 'Lookup failed', detail: String(e).slice(0, 200) });
  }
  if (!data) return res.status(502).json({ error: 'Empty response from model' });

  // Atwater sanity check: kcal ≈ 4·protein + 4·carb + 9·fat. Flag implausible results
  // (same idea the bundled DB uses via qa_note) so the app can warn before saving.
  const est = 4 * num(data.protein_g) + 4 * num(data.carb_g) + 9 * num(data.fat_g);
  const kcal = num(data.energy_kcal);
  const sane = Math.abs(kcal - est) <= Math.max(50, 0.3 * Math.max(kcal, 1));

  return res.status(200).json({
    name,
    energy_kcal: round1(kcal),
    protein_g: round1(num(data.protein_g)),
    carb_g: round1(num(data.carb_g)),
    fat_g: round1(num(data.fat_g)),
    fibre_g: round1(num(data.fibre_g)),
    confidence: data.confidence ?? 'low',
    basis_note: String(data.basis_note ?? ''),
    source: String(data.source ?? 'AI estimate'),
    sane,
  });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function num(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
