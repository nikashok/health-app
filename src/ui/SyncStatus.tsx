/**
 * Backup-status chip. Reads the live outbox depth from the sync store and shows whether
 * everything is backed up to Supabase. Tapping it runs a full reconcile ("Back up now"),
 * so it doubles as the manual force-sync. Local writes are always durable on-device —
 * this only reflects the cloud backup.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { reconcile, useSyncStatus } from '@/db/sync';
import { colors, radius, type } from '@/ui/theme';

export function SyncStatus({ style }: { style?: StyleProp<ViewStyle> }) {
  const { pending, syncing, lastError } = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const active = syncing || busy;

  async function onPress() {
    if (active) return;
    setBusy(true);
    try {
      await reconcile();
    } catch {
      /* errors surface via the store's lastError + pending count */
    } finally {
      setBusy(false);
    }
  }

  let label: string;
  let tone = colors.muted;
  if (active) {
    label = 'Backing up…';
  } else if (pending > 0) {
    label = lastError ? `Offline · ${pending} to back up` : `${pending} to back up`;
    tone = colors.saffron;
  } else {
    label = 'Backed up';
    tone = colors.leafDark;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={active}
      hitSlop={6}
      style={[styles.wrap, style]}
      accessibilityRole="button"
      accessibilityLabel={pending > 0 ? 'Back up now' : 'Backed up'}
    >
      {active ? (
        <ActivityIndicator size="small" color={tone} />
      ) : (
        <View style={[styles.dot, { backgroundColor: tone }]} />
      )}
      <Text style={[styles.text, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.fillStrong,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { ...type.caption, fontWeight: '600' },
});
