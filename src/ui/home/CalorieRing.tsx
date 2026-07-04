import { Text, View } from 'react-native';
import {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Svg,
} from 'react-native-svg';

import type { Totals } from '@/calc/dayTotals';
import { dark as D } from '@/ui/theme';

import { RING_C, RING_R } from './homeUtils';
import { styles } from './styles';

/** Calorie progress ring with "eaten today" center and the remaining/over pill. */
export function CalorieRing({ consumed, target }: { consumed: Totals; target: number | null }) {
  const calRatio = target ? consumed.kcal / target : 0;

  return (
    <View style={styles.card}>
      <View style={styles.ringWrap}>
        <Svg width={232} height={232} viewBox="0 0 232 232">
          <Defs>
            <SvgLinearGradient id="calGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={D.accent2} />
              <Stop offset="1" stopColor={D.accent} />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={116}
            cy={116}
            r={RING_R}
            fill="none"
            stroke={D.trackBg}
            strokeWidth={17}
          />
          {(target != null || consumed.kcal > 0) && (
            <Circle
              cx={116}
              cy={116}
              r={RING_R}
              fill="none"
              stroke="url(#calGrad)"
              strokeWidth={17}
              strokeLinecap="round"
              strokeDasharray={`${RING_C}`}
              strokeDashoffset={`${RING_C * (1 - Math.min(1, target ? calRatio : 0.5))}`}
              transform="rotate(-90 116 116)"
            />
          )}
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.ringEyebrow}>Eaten today</Text>
          <Text style={styles.ringKcal}>
            {Math.round(consumed.kcal).toLocaleString()}
          </Text>
          {target != null && (
            <Text style={styles.ringTarget}>
              of {Math.round(target).toLocaleString()} kcal
            </Text>
          )}
        </View>
      </View>

      {target != null && (
        <View
          style={[
            styles.goalPill,
            consumed.kcal >= target ? styles.goalPillOk : styles.goalPillPending,
          ]}
        >
          {consumed.kcal >= target ? (
            <Text style={styles.goalText}>
              ✓  Goal reached · {Math.round(consumed.kcal - target)} over
            </Text>
          ) : (
            <Text style={styles.goalTextPending}>
              {Math.round(target - consumed.kcal).toLocaleString()} kcal remaining
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
