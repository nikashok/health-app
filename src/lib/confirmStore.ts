/**
 * The pending in-app confirmation (web). `src/lib/confirm.ts` puts a request here and
 * <ConfirmHost /> (root layout) shows it as a sheet — instead of window.confirm, whose
 * browser dialog shows the site's domain and can't say "Delete" or "Sign Out".
 */
import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: () => void;
}

export const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

export function askConfirm(request: ConfirmRequest): void {
  useConfirmStore.setState({ request });
}

export function closeConfirm(): void {
  useConfirmStore.setState({ request: null });
}
