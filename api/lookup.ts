/**
 * Vercel serverless function: GROUNDED AI nutrition lookup.
 *
 * The app sends a food name + an optional free-text description + the signed-in user's
 * Supabase access token. We verify the token (so this isn't an open endpoint burning
 * OpenAI credits), then run a TWO-STEP OpenAI Responses API flow:
 *   1. Search step — the web_search tool researches per-100g nutrition from credible
 *      food-composition sources and returns real CITATIONS (url_citation annotations +
 *      web_search_call sources).
 *   2. Extract step — Structured Outputs (strict JSON schema, no tools) distils the
 *      grounded text into per-100g numbers.
 * We attach the step-1 citations as `sources` so the user can verify before approving,
 * and Atwater-sanity-check the calories vs macros.
 *
 * Web search + strict structured output aren't documented as combinable in one call, so
 * the two steps are deliberate.
 *
 * Secrets live here, never in the app bundle:
 *   OPENAI_API_KEY       (required)   — Vercel → Settings → Environment Variables
 *   OPENAI_MODEL         (optional)   — extract step model; defaults to gpt-5.4-mini
 *   OPENAI_SEARCH_MODEL  (optional)   — search step model (must support web_search);
 *                                       defaults to gpt-4.1-mini (documented support)
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://evxwakgxbfwymvmyowic.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eHdha2d4YmZ3eW12bXlvd2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzMyODYsImV4cCI6MjA5NzU0OTI4Nn0.EMt2PK2Hvr1UL75xzBN0aSYnFOqxySlVhev84PWUxU4';
const EXTRACT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
const SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL ?? 'gpt-4.1-mini';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';

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
      description: 'The most authoritative basis named in the research, e.g. "USDA FoodData Central", "IFCT 2017"',
    },
  },
  required: ['energy_kcal', 'protein_g', 'carb_g', 'fat_g', 'fibre_g', 'confidence', 'basis_note', 'source'],
} as const;

const SEARCH_INSTRUCTIONS = [
  'You are a nutrition researcher for an Indian food tracker.',
  'Use web search to find per-100g nutrition (energy, protein, carbohydrate, fat, fibre)',
  'for the food AS COMMONLY PREPARED AND EATEN. Prefer authoritative food-composition',
  'sources — USDA FoodData Central, IFCT 2017 / NIN (for Indian foods), and government or',
  'peer-reviewed data — over blogs and recipe aggregators. For a homemade/composite dish,',
  'estimate from a typical recipe and say so. Then summarise the per-100g values, the',
  'cooked-vs-raw assumption, and which sources support them. Keep it concise.',
].join(' ');

const EXTRACT_INSTRUCTIONS = [
  'From the research summary provided, output nutrition as strict JSON.',
  'ALL values are PER 100 GRAMS of edible portion — never per serving.',
  'Set confidence by how standardized the food is and how well the sources agree.',
  'basis_note: one short phrase on the cooked/raw assumption. source: the most',
  'authoritative basis named in the research.',
].join(' ');

const BLOCKED_DOMAINS = ['pinterest.com', 'reddit.com', 'quora.com', 'facebook.com', 'instagram.com'];

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

async function callResponses(apiKey: string, body: any, signal: AbortSignal): Promise<any> {
  const r = await fetch(RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`OpenAI ${r.status}: ${detail.slice(0, 300)}`);
  }
  return r.json();
}

/** Aggregate assistant text from a Responses API result. */
function responseText(resp: any): string {
  if (typeof resp?.output_text === 'string' && resp.output_text) return resp.output_text;
  const parts: string[] = [];
  for (const item of resp?.output ?? []) {
    if (item?.type === 'message') {
      for (const c of item.content ?? []) if (c?.type === 'output_text' && c.text) parts.push(c.text);
    }
  }
  return parts.join('\n');
}

/** Collect citations: url_citation annotations + web_search_call sources, deduped. */
function responseCitations(resp: any): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  for (const item of resp?.output ?? []) {
    if (item?.type === 'message') {
      for (const c of item.content ?? []) {
        for (const a of c?.annotations ?? []) {
          if (a?.type === 'url_citation' && a.url) out.push({ title: a.title || a.url, url: a.url });
        }
      }
    }
    if (item?.type === 'web_search_call') {
      for (const s of item.action?.sources ?? []) {
        if (s?.url) out.push({ title: s.title || s.url, url: s.url });
      }
    }
  }
  const seen = new Set<string>();
  const deduped: { title: string; url: string }[] = [];
  for (const s of out) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    deduped.push(s);
  }
  return deduped.slice(0, 6);
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
  const description = String(body?.description ?? '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Provide a food name' });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 45000);

  let data: any;
  let sources: { title: string; url: string }[] = [];
  try {
    const userText = description ? `Food: ${name}\nDetails: ${description}` : `Food: ${name}`;

    // 1) Grounded research with web search.
    const search = await callResponses(
      apiKey,
      {
        model: SEARCH_MODEL,
        instructions: SEARCH_INSTRUCTIONS,
        input: userText,
        tools: [{ type: 'web_search', filters: { blocked_domains: BLOCKED_DOMAINS } }],
        include: ['web_search_call.action.sources'],
      },
      ac.signal
    );
    const research = responseText(search);
    sources = responseCitations(search);

    // 2) Distil into strict per-100g JSON (no tools).
    const extract = await callResponses(
      apiKey,
      {
        model: EXTRACT_MODEL,
        instructions: EXTRACT_INSTRUCTIONS,
        input: `Research summary:\n${research}`,
        text: {
          format: { type: 'json_schema', name: 'nutrition', strict: true, schema: NUTRITION_SCHEMA },
        },
      },
      ac.signal
    );
    data = safeParse(responseText(extract));
  } catch (e) {
    return res.status(502).json({ error: 'Lookup failed', detail: String(e).slice(0, 300) });
  } finally {
    clearTimeout(timer);
  }
  if (!data) return res.status(502).json({ error: 'Empty response from model' });

  // Atwater sanity check: kcal ≈ 4·protein + 4·carb + 9·fat. Flag implausible results so
  // the app can warn before saving.
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
    source: String(data.source ?? (sources[0] ? hostOf(sources[0].url) : 'AI estimate')),
    sources,
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
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'web source';
  }
}
