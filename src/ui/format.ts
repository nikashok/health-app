export function kcal(n: number | null | undefined): string {
  return n != null ? `${Math.round(n)} kcal` : '— kcal';
}

export function grams(n: number | null | undefined): string {
  return n != null ? `${Math.round(n)}g` : '—';
}

export function numberText(n: number | null | undefined): string {
  return n != null ? String(Math.round(n)) : '—';
}
