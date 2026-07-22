import dayjs from 'dayjs';
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

import { buildAreaPath, buildSparkPoints, carryForward, latestMeasured } from './homeUtils';
import { styles } from './styles';

/**
 * Weight + waist lifetime sparkline cards. Values carry forward: on a day with no
 * reading the card keeps showing the last one recorded, stamped with its date.
 */
export function BodyTrends({
  allMeasurements,
  todayISO,
}: {
  allMeasurements: BodyMeasurement[];
  todayISO: string;
}) {
  const weight = latestMeasured(allMeasurements, 'weight_kg');
  const waist = latestMeasured(allMeasurements, 'waist_cm');
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Trends</Text>
      <View style={styles.trendsGrid}>
        <MiniTrendCard
          label="Weight"
          value={weight?.value ?? null}
          asOf={asOfLabel(weight?.date, todayISO)}
          unit="kg"
          data={carryForward(allMeasurements.map((m) => m.weight_kg))}
          strokeColor={D.amber}
          gradId="wA"
          gradColor={D.amber}
        />
        <MiniTrendCard
          label="Waist"
          value={waist?.value ?? null}
          asOf={asOfLabel(waist?.date, todayISO)}
          unit="cm"
          data={carryForward(allMeasurements.map((m) => m.waist_cm))}
          strokeColor={D.cyan}
          gradId="wB"
          gradColor={D.cyan}
        />
      </View>
    </View>
  );
}

/** "as of 12 Jul" when the shown value is carried over from an earlier day. */
function asOfLabel(date: string | undefined, todayISO: string): string | null {
  if (!date || date === todayISO) return null;
  return `as of ${dayjs(date).format('D MMM')}`;
}

function MiniTrendCard({
  label,
  value,
  asOf,
  unit,
  data,
  strokeColor,
  gradId,
  gradColor,
}: {
  label: string;
  value: number | null;
  asOf: string | null;
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
      {asOf ? <Text style={styles.trendAsOf}>{asOf}</Text> : null}
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
