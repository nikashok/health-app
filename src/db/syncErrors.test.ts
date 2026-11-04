import { isMissingTable } from './syncErrors';

describe('isMissingTable', () => {
  test('recognises a table that has not been created yet', () => {
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.favorite_foods' in the schema cache" })).toBe(true);
    expect(isMissingTable({ code: '42P01', message: 'relation "public.favorite_foods" does not exist' })).toBe(true);
    expect(isMissingTable({ message: 'relation "favorite_foods" does not exist' })).toBe(true);
  });

  test('anything else is a real failure (offline, auth, RLS)', () => {
    expect(isMissingTable(new TypeError('Failed to fetch'))).toBe(false);
    expect(isMissingTable({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
