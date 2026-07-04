import { Text, View } from 'react-native';
import {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Polyline,
  Stop,
  Svg,
} from 'react-native-svg';

import type { BodyMeasurement } from '@/types/db';
import { dark as D } from '@/ui/theme';

import { buildAreaPath, buildSparkPoints } from './homeUtils';
import { styles } from './styles';

/** Weight + waist lifetime sparkline cards. */
export function BodyTrends({
  measurement,
  allMeasurements,
}: {
  measurement: BodyMeasurement | null;
  allMeasurements: BodyMeasurement[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Trends</Text>
      <View style={styles.trendsGrid}>
        <MiniTrendCard
          label="Weight"
          value={measurement?.weight_kg ?? null}
          unit="kg"
          data={allMeasurements.map((m) => m.weight_kg ?? 0)}
          strokeColor={D.amber}
          gradId="wA"
          gradColor={D.amber}
        />
        <MiniTrendCard
          label="Waist"
          value={measurement?.waist_cm ?? null}
          unit="cm"
          data={allMeasurements.map((m) => m.waist_cm ?? 0)}
          strokeColor={D.cyan}
          gradId="wB"
          gradColor={D.cyan}
        />
      </View>
    </View>
  );
}

function MiniTrendCard({
  label,
  value,
  unit,
  data,
  strokeColor,
  gradId,
  gradColor,
}: {
  label: string;
  value: number | null;
  unit: string;
  data: number[];
  strokeColor: string;
  gradId: string;
  gradColor: string;
}) {
  const sparkPts = buildSparkPoints(data, 120, 38);
  const areaPath = sparkPts ? buildAreaPath(sparkPts, 38) : '';

  return (
    <View style={styles.trendCard}>
      <Text style={styles.trendLabel}>{label}</Text>
      <View style={styles.trendValRow}>
        <Text style={styles.trendVal}>{value ?? '—'}</Text>
        <Text style={styles.trendUnit}>{unit}</Text>
      </View>
      <Svg width="100%" height={38} viewBox="0 0 120 38" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradColor} stopOpacity={0.34} />
            <Stop offset="1" stopColor={gradColor} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        {sparkPts ? (
          <>
            <Path d={areaPath} fill={`url(#${gradId})`} />
            <Polyline
              points={sparkPts}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
