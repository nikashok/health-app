import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, type } from '@/ui/theme';

/** How far (kg) trend weight may drift from the profile weight before we suggest re-targeting. */
export const TARGET_DRIFT_KG = 2;

/**
 * "Your trend is 77.6 kg — 2.4 kg below the 80 kg your targets use." Calorie and protein
 * targets are computed from the profile weight, which never updates on its own; this
 * offers to recompute them. Dismissal lasts until the trend moves another 2 kg.
 */
export function TargetsNudge({
  profileWeight,
  trend,
  onUpdate,
  onDismiss,
}: {
  profileWeight: number;
  trend: number;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const diff = trend - profileWeight;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>Update your targets?</Text>
      <Text style={styles.body}>
        Your weight trend is {trend.toFixed(1)} kg — {Math.abs(diff).toFixed(1)} kg{' '}
        {diff < 0 ? 'below' : 'above'} the {profileWeight} kg your calorie and protein targets were
        set for.
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onUpdate}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Update targets</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.leaf,
    gap: 6,
  },
  title: { ...type.headline, color: colors.ink },
  body: { ...type.subhead, color: colors.muted, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  primary: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.leaf, justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  primaryText: { ...type.subhead, fontWeight: '600', color: '#ffffff' },
  secondary: { height: 36, justifyContent: 'center' },
  secondaryText: { ...type.subhead, color: colors.leaf },
});
