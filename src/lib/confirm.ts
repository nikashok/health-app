import { Alert, Platform } from 'react-native';

import { askConfirm } from './confirmStore';

/**
 * Cross-platform confirm. Native uses the system Alert; web shows the app's own sheet
 * (<ConfirmHost />) because window.confirm can't label its buttons and shows the domain.
 */
function confirm(
  title: string,
  message: string,
  confirmLabel: string,
  destructive: boolean,
  onConfirm: () => void
): void {
  if (Platform.OS === 'web') {
    askConfirm({ title, message, confirmLabel, destructive, onConfirm });
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/** "Delete entry?" — the confirm button is red. */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
): void {
  confirm(title, message, confirmLabel, true, onConfirm);
}

/** "Are you sure?" for a non-destructive action (e.g. an unusual value). */
export function confirmProceed(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
): void {
  confirm(title, message, confirmLabel, false, onConfirm);
}
