import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Polyline, Svg } from 'react-native-svg';

import type { BodyMeasurement } from '@/types/db';
import { Chevron } from '@/ui/components';
import { Icon } from '@/ui/icons';
import { colors } from '@/ui/theme';

import { buildSparkPoints, carryForward, changeLine, latestMeasured } from './homeUtils';
import { styles } from './styles';

const SPARK_H = 40;

/**
 * Weight + waist cards: latest reading (carried forward from the last day it was
 * recorded), the change over 30 days, and a lifetime sparkline. The weight card says when
 * today's reading is still missing — weighing is a daily habit; waist is weekly.
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
  const weight = latestMeasured(allMeasurements, 'weight_kg');
  const waist = latestMeasured(allMeasurements, 'waist_cm');
  return (
    <View style={styles.bodyGrid}>
      <BodyCard
        label="Weight"
        value={weight?.value ?? null}
        unit="kg"
        logToday={weight?.date !== todayISO}
        change={changeLine(allMeasurements, 'weight_kg', 'kg', todayISO)}
        data={carryForward(allMeasurements.map((m) => m.weight_kg))}
        onPress={onPress}
      />
      <BodyCard
        label="Waist"
        value={waist?.value ?? null}
        unit="cm"
        change={changeLine(allMeasurements, 'waist_cm', 'cm', todayISO)}
        data={carryForward(allMeasurements.map((m) => m.waist_cm))}
        onPress={onPress}
      />
    </View>
  );
}

function BodyCard({
  label,
  value,
  unit,
  logToday,
  change,
  data,
  onPress,
}: {
  label: string;
  value: number | null;
  unit: string;
  logToday?: boolean;
  change: string;
  data: number[];
  onPress: () => void;
}) {
  const [width, setWidth] = useState(0);
  const pts = width > 0 ? buildSparkPoints(data, width, SPARK_H) : '';
  const shown = value != null ? value.toFixed(1) : '—';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.bodyCard, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value != null ? `${shown} ${unit}` : 'not recorded'}. ${change}.${
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
      <Text style={styles.bodyChange} numberOfLines={1}>
        {change}
      </Text>
      <View style={styles.spark} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {pts ? (
          <Svg width={width} height={SPARK_H}>
            <Polyline
              points={pts}
              fill="none"
              stroke={colors.good}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
    </Pressable>
  );
}
