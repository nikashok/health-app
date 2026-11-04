/** Pure helpers for classifying backup errors (unit-tested without a Supabase client). */

/**
 * True when a push failed because the remote table doesn't exist yet: PostgREST's
 * "Could not find the table … in the schema cache" (PGRST205) or Postgres's "relation
 * does not exist" (42P01). Used to skip tables whose migration is applied by hand.
 */
export function isMissingTable(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === 'PGRST205' || err.code === '42P01') return true;
  return /could not find the table|relation .* does not exist/i.test(err.message ?? '');
}
