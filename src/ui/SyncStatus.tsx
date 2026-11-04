/**
 * Backup-status chip. Reads the live outbox depth from the sync store and shows whether
 * everything is backed up to Supabase. Tapping it runs a full reconcile ("Back up now"),
 * so it doubles as the manual force-sync. Local writes are always durable on-device —
 * this only reflects the cloud backup.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { reconcile, useSyncStatus } from '@/db/sync';
import { colors, type } from '@/ui/theme';

/**
 * `compact` shows just the status dot (narrow screens); the label stays for screen readers.
 * `inline` drops the pill background so it can sit in a line of meta text (Today's header).
 */
export function SyncStatus({
  style,
  compact,
  inline,
}: {
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  inline?: boolean;
}) {
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
    tone = colors.energy;
  } else {
    label = 'Backed up';
    tone = colors.good;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={active}
      hitSlop={6}
      style={[styles.wrap, inline && styles.inline, style]}
      accessibilityRole="button"
      accessibilityLabel={pending > 0 ? `${label}. Back up now` : label}
    >
      {active ? (
        <ActivityIndicator size="small" color={tone} />
      ) : (
        <View style={[styles.dot, { backgroundColor: tone }]} />
      )}
      {compact ? null : (
        <Text style={[styles.text, inline && styles.inlineText, { color: inline && tone === colors.good ? colors.muted : tone }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
  },
  inline: { backgroundColor: 'transparent', paddingHorizontal: 0, height: undefined, minHeight: 24 },
  inlineText: { ...type.subhead, fontWeight: '400' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { ...type.caption, fontWeight: '600' },
});
