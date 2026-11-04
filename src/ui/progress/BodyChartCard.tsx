/**
 * A body-measurement chart for the Progress tab: range picker (1M / 3M / 6M / All), the
 * readings as dots on a real time axis, and — for weight — the smoothed trend line with
 * its change over the range and weekly rate. Derived for display; nothing is stored.
 */
import dayjs from 'dayjs';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dayNumber, trendChange, trendSeries, weeklyRate, type Reading } from '@/calc/trend';
import { chartScale, LineChart } from '@/ui/charts/LineChart';
import { CardHeader, Segmented } from '@/ui/components';
import { colors, heroNumber, radius, type } from '@/ui/theme';

type Range = '1M' | '3M' | '6M' | 'All';
const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: 'All', label: 'All' },
];
const RANGE_DAYS: Record<Exclude<Range, 'All'>, number> = { '1M': 30, '3M': 91, '6M': 182 };
const H = 150;

function signed(d: number, unit: string, digits = 1): string {
  const r = Math.round(d * 10 ** digits) / 10 ** digits;
  if (r === 0) return `0 ${unit}`;
  return `${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(digits)} ${unit}`;
}

export function BodyChartCard({
  title,
  unit,
  readings,
  smooth,
  minSpan,
  todayISO,
}: {
  title: string;
  unit: string;
  readings: Reading[];
  /** true = draw the trend line (weight); false = connect the raw readings (waist). */
  smooth: boolean;
  minSpan: number;
  todayISO: string;
}) {
  const [range, setRange] = useState<Range>('3M');
  const [width, setWidth] = useState(0);

  const series = smooth
    ? trendSeries(readings)
    : [...readings].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ ...r, trend: r.value }));
  if (series.length === 0) {
    return (
      <View style={styles.card}>
        <CardHeader label={title} color={colors.good} />
        <Text style={styles.empty}>No readings yet — log one from the Weight card on Today.</Text>
      </View>
    );
  }

  const end = dayNumber(todayISO);
  const days = range === 'All' ? end - dayNumber(series[0].date) : RANGE_DAYS[range];
  // Never start the time axis before the first reading — no blank stretch on the left.
  const start = Math.max(end - Math.max(days, 7), Math.min(dayNumber(series[0].date), end - 7));
  const shown = series.filter((p) => dayNumber(p.date) >= start);
  const latest = series[series.length - 1];
  const change = trendChange(series, todayISO, days);
  const rate = smooth ? weeklyRate(series, todayISO) : null;
  const line = shown.map((p) => ({ x: dayNumber(p.date), y: p.trend }));
  const dots = shown.map((p) => ({ x: dayNumber(p.date), y: p.value }));
  const scale = width > 0 && shown.length > 0 ? chartScale([...line, ...dots], width, H, { minSpan, domain: [start, end] }) : null;

  return (
    <View style={styles.card}>
      <CardHeader label={title} color={colors.good} detail={smooth ? 'Trend' : 'Readings'} />
      <View style={styles.stats}>
        <Stat label={smooth ? 'Trend now' : 'Latest'} value={`${latest.trend.toFixed(1)}`} unit={unit} />
        <Stat
          label={change && !change.full ? `Since ${dayjs(change.since).format('D MMM')}` : 'Change'}
          value={change ? signed(change.delta, '').trim() : '—'}
          unit={change ? unit : ''}
        />
        {smooth ? <Stat label="Per week" value={rate != null ? signed(rate, '').trim() : '—'} unit={rate != null ? unit : ''} /> : null}
      </View>

      <Segmented options={RANGES} value={range} onChange={setRange} style={styles.ranges} />

      <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {shown.length > 0 ? (
          <LineChart
            width={width}
            height={H}
            line={line}
            dots={dots}
            color={colors.good}
            dotColor={smooth ? 'rgba(48,209,88,0.4)' : colors.good}
            minSpan={minSpan}
            domain={[start, end]}
            dotRadius={smooth ? 2.2 : 3}
          />
        ) : (
          <Text style={styles.empty}>No readings in this range.</Text>
        )}
        {scale ? (
          <>
            <Text style={[styles.yLabel, { top: 0 }]}>{scale.maxY.toFixed(1)}</Text>
            <Text style={[styles.yLabel, { bottom: 0 }]}>{scale.minY.toFixed(1)}</Text>
          </>
        ) : null}
      </View>
      <View style={styles.xLabels} importantForAccessibility="no-hide-descendants">
        <Text style={styles.xLabel}>{dayjs(todayISO).subtract(end - start, 'day').format('D MMM')}</Text>
        <Text style={[styles.xLabel, styles.xToday]}>Today</Text>
      </View>
      {smooth ? (
        <Text style={styles.note}>
          Dots are scale readings. The line is your trend, which smooths out day-to-day water
          swings — judge progress by the line.
        </Text>
      ) : null}
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value} ${unit}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValRow}>
        <Text style={styles.statVal}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
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
  },
  stats: { flexDirection: 'row', marginTop: 10, gap: 8 },
  stat: { flex: 1, minWidth: 0, gap: 2 },
  statLabel: { ...type.footnote, color: colors.muted },
  statValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statVal: heroNumber(24),
  statUnit: { ...type.subhead, fontWeight: '600', color: colors.muted },
  ranges: { marginTop: 14 },
  chart: { height: H, marginTop: 14, justifyContent: 'center' },
  yLabel: { position: 'absolute', right: 0, fontSize: 11, color: colors.muted },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  xLabel: { fontSize: 11, color: colors.muted },
  xToday: { color: colors.ink, fontWeight: '700' },
  note: { ...type.caption, color: colors.muted, marginTop: 10, lineHeight: 16 },
  empty: { ...type.subhead, color: colors.muted, marginTop: 10 },
});
