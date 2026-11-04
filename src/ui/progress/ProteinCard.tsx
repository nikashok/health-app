/**
 * Protein adherence (PRD HOME-3): average daily protein over the past 7 and 30 days
 * against the target, counted over the same finished, properly logged days as the
 * calorie averages. Reads logged snapshots only.
 */
import { StyleSheet, Text, View } from 'react-native';

import { CardHeader } from '@/ui/components';
import { clampPercent, colors, heroNumber, radius, type } from '@/ui/theme';

export function ProteinCard({
  week,
  month,
  target,
}: {
  week: { avg: number; countedDays: number };
  month: { avg: number; countedDays: number };
  target: number | null;
}) {
  return (
    <View style={styles.card}>
      <CardHeader label="Protein" color={colors.protein} detail={target != null ? `Target ${Math.round(target)} g` : undefined} />
      <Row label="Past 7 days" avg={week} target={target} />
      <Row label="Past 30 days" avg={month} target={target} />
    </View>
  );
}

function Row({
  label,
  avg,
  target,
}: {
  label: string;
  avg: { avg: number; countedDays: number };
  target: number | null;
}) {
  const has = avg.countedDays > 0;
  const pct = target ? Math.round((avg.avg / target) * 100) : null;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${has ? `${Math.round(avg.avg)} grams a day${pct != null ? `, ${pct}% of target` : ''}` : 'not enough data'}`}
    >
      <View style={styles.rowTop}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.valueText}>
          <Text style={styles.value}>{has ? Math.round(avg.avg) : '—'}</Text>
          <Text style={styles.unit}> g/day{pct != null && has ? ` · ${pct}%` : ''}</Text>
        </Text>
      </View>
      {target ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: clampPercent(has ? avg.avg / target : 0) }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 4,
  },
  row: { marginTop: 10, gap: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { ...type.subhead, color: colors.muted },
  valueText: { ...type.subhead },
  value: heroNumber(20),
  unit: { ...type.footnote, color: colors.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.protein },
});
