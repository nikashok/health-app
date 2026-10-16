import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Polyline, Svg } from 'react-native-svg';

import type { BodyMeasurement } from '@/types/db';
import { Chevron } from '@/ui/components';
import { colors } from '@/ui/theme';

import { buildSparkPoints, carryForward, changeLine, latestMeasured } from './homeUtils';
import { styles } from './styles';

const SPARK_H = 40;

/**
 * Weight + waist cards: latest reading (carried forward from the last day it was
 * recorded), the change over 30 days, and a lifetime sparkline.
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
  change,
  data,
  onPress,
}: {
  label: string;
  value: number | null;
  unit: string;
  change: string;
  data: number[];
  onPress: () => void;
}) {
  const [width, setWidth] = useState(0);
  const pts = width > 0 ? buildSparkPoints(data, width, SPARK_H) : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.bodyCard, pressed && styles.cardPressed]}
    >
      <View style={styles.bodyHead}>
        <Text style={styles.bodyLabel}>{label}</Text>
        <Chevron />
      </View>
      <View style={styles.bodyValRow}>
        <Text style={styles.bodyVal} maxFontSizeMultiplier={1.3}>
          {value ?? '—'}
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
