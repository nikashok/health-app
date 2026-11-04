import dayjs from 'dayjs';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { dayNumber, trendChange, trendSeries, type Reading } from '@/calc/trend';
import type { BodyMeasurement } from '@/types/db';
import { LineChart } from '@/ui/charts/LineChart';
import { Chevron } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { colors } from '@/ui/theme';

import { changeLine, latestMeasured } from './homeUtils';
import { styles } from './styles';

const SPARK_H = 40;
const WINDOW_DAYS = 60;

export function readings(all: BodyMeasurement[], key: 'weight_kg' | 'waist_cm'): Reading[] {
  return all
    .filter((m) => m[key] != null && (m[key] as number) > 0)
    .map((m) => ({ date: m.measured_on, value: m[key] as number }));
}

function signed(delta: number, unit: string): string {
  const r = Math.round(delta * 10) / 10;
  if (r === 0) return `No change`;
  return `${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(1)} ${unit}`;
}

/**
 * Weight + waist cards. Weight leads with the TREND (smoothed — daily water swings of
 * 1–2 kg don't move it), with the latest scale reading underneath and the 30-day change
 * measured on the trend. Waist is measured weekly, so it shows the raw readings. Both
 * charts cover the last 60 days on a real time axis. Derived for display only.
 */
export function BodyTrends({
  allMeasurements,
  todayISO,
  onPress,
}: {
  allMeasurements: BodyMeasurement[];
  todayISO: string;
  onPress: () => void;
}) {
  const weights = trendSeries(readings(allMeasurements, 'weight_kg'));
  const latestW = weights[weights.length - 1] ?? null;
  const wc = trendChange(weights, todayISO, 30);
  const weightChange = !latestW
    ? 'No readings yet'
    : wc
      ? `${signed(wc.delta, 'kg')} ${wc.full ? 'in 30 days' : `since ${dayjs(wc.since).format('D MMM')}`}`
      : 'First reading';
  const waist = latestMeasured(allMeasurements, 'waist_cm');
  const start = dayNumber(todayISO) - WINDOW_DAYS;
  const inWindow = <T extends Reading>(r: T) => dayNumber(r.date) >= start;
  const wWin = weights.filter(inWindow);
  const waistWin = readings(allMeasurements, 'waist_cm').filter(inWindow);

  return (
    <View style={styles.bodyGrid}>
      <BodyCard
        label="Weight"
        value={latestW?.trend ?? null}
        unit="kg"
        sub={latestW ? `Trend · scale ${latestW.value.toFixed(1)}` : null}
        logToday={latestW?.date !== todayISO}
        change={weightChange}
        line={wWin.map((p) => ({ x: dayNumber(p.date), y: p.trend }))}
        dots={wWin.map((p) => ({ x: dayNumber(p.date), y: p.value }))}
        minSpan={2}
        domain={[start, dayNumber(todayISO)]}
        onPress={onPress}
      />
      <BodyCard
        label="Waist"
        value={waist?.value ?? null}
        unit="cm"
        sub={waist ? `Last measured ${waist.date === todayISO ? 'today' : dayjs(waist.date).format('D MMM')}` : null}
        change={changeLine(allMeasurements, 'waist_cm', 'cm', todayISO)}
        line={waistWin.map((p) => ({ x: dayNumber(p.date), y: p.value }))}
        minSpan={3}
        domain={[start, dayNumber(todayISO)]}
        onPress={onPress}
      />
    </View>
  );
}

function BodyCard({
  label,
  value,
  unit,
  sub,
  logToday,
  change,
  line,
  dots,
  minSpan,
  domain,
  onPress,
}: {
  label: string;
  value: number | null;
  unit: string;
  sub: string | null;
  logToday?: boolean;
  change: string;
  line: { x: number; y: number }[];
  dots?: { x: number; y: number }[];
  minSpan: number;
  domain: [number, number];
  onPress: () => void;
}) {
  const [width, setWidth] = useState(0);
  const shown = value != null ? value.toFixed(1) : '—';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.bodyCard, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value != null ? `${shown} ${unit}` : 'not recorded'}. ${sub ? `${sub}. ` : ''}${change}.${
        logToday ? ' Not logged today.' : ''
      }`}
    >
      <View style={styles.bodyHead}>
        <Text style={styles.bodyLabel}>{label}</Text>
        {logToday ? (
          <View style={styles.bodyLogPill}>
            <Icon name="plus" size={12} color={colors.leaf} strokeWidth={3} />
            <Text style={styles.bodyLogText}>Today</Text>
          </View>
        ) : (
          <Chevron />
        )}
      </View>
      <View style={styles.bodyValRow}>
        <Text style={styles.bodyVal} maxFontSizeMultiplier={1.3}>
          {shown}
        </Text>
        <Text style={styles.bodyUnit}>{unit}</Text>
      </View>
      {sub ? (
        <Text style={styles.bodySub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      <Text style={styles.bodyChange} numberOfLines={1}>
        {change}
      </Text>
      <View style={styles.spark} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {line.length > 0 ? (
          <LineChart
            width={width}
            height={SPARK_H}
            line={line}
            dots={dots}
            color={colors.good}
            dotColor="rgba(48,209,88,0.35)"
            minSpan={minSpan}
            domain={domain}
            dotRadius={1.6}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
