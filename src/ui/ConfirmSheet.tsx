/**
 * In-app confirmation sheet (web), driven by src/lib/confirmStore. Rendered once in the
 * root layout, like <Toast />. Cancel is the default; the action button is red for
 * destructive actions.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { closeConfirm, useConfirmStore } from '@/lib/confirmStore';

import { colors, radius, type } from './theme';

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const insets = useSafeAreaInsets();
  if (!request) return null;
  const confirm = () => {
    closeConfirm();
    request.onConfirm();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeConfirm}>
      <Pressable style={styles.backdrop} onPress={closeConfirm} accessibilityLabel="Cancel">
        <Pressable
          style={[styles.sheet, { marginBottom: 12 + insets.bottom }]}
          onPress={() => {}}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          <Pressable
            onPress={confirm}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, request.destructive && styles.destructive]}>
              {request.confirmLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={closeConfirm}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingTop: 18, overflow: 'hidden' },
  title: { ...type.headline, color: colors.ink, textAlign: 'center', paddingHorizontal: 20 },
  message: { ...type.subhead, color: colors.muted, textAlign: 'center', marginTop: 6, paddingHorizontal: 20, lineHeight: 20 },
  action: {
    marginTop: 18,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  actionText: { ...type.body, fontWeight: '600', color: colors.leaf },
  destructive: { color: colors.rose },
  cancel: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  cancelText: { ...type.body, color: colors.ink },
  pressed: { backgroundColor: colors.fill },
});
