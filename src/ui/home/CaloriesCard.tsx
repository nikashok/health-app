import { Fragment } from 'react';
import { Text, View } from 'react-native';
import { Circle, Svg } from 'react-native-svg';

import type { Totals } from '@/calc/dayTotals';
import { ratio } from '@/calc/insights';
import type { UserProfile } from '@/types/db';
import { CardHeader, Hairline } from '@/ui/components';
import { int } from '@/ui/format';
import { clampPercent, colors } from '@/ui/theme';

import { FIBRE_TARGET_G, RING_C, RING_R, RING_SIZE, RING_STROKE } from './homeUtils';
import { styles } from './styles';

/** Big numbers stop growing past this text-size multiplier, so the columns can't clip. */
const MAX_SCALE = 1.3;

/** Today's calories (number + ring) with the four macro columns folded in below. */
export function CaloriesCard({
  consumed,
  profile,
  onGoalPress,
}: {
  consumed: Totals;
  profile: UserProfile;
  onGoalPress: () => void;
}) {
  const target = profile.target_kcal ?? null;
  const calRatio = ratio(consumed.kcal, target);
  const left = target != null ? target - consumed.kcal : null;
  const over = calRatio > 1;
  const pct = Math.round(calRatio * 100);
  const c = RING_SIZE / 2;

  const macros = [
    { name: 'Protein', value: consumed.protein_g, target: profile.target_protein_g, color: colors.protein },
    { name: 'Carbs', value: consumed.carb_g, target: profile.target_carb_g, color: colors.carbs },
    { name: 'Fat', value: consumed.fat_g, target: profile.target_fat_g, color: colors.fat },
    { name: 'Fibre', value: consumed.fibre_g, target: FIBRE_TARGET_G, color: colors.fibre },
  ];

  return (
    <View style={[styles.card, styles.caloriesCard]}>
      <CardHeader
        label="Calories"
        color={colors.energy}
        detail={target != null ? `Goal ${int(target)}` : 'Set goal'}
        onPress={onGoalPress}
      />

      <View style={styles.calBody}>
        <View style={styles.calLeft}>
          <Text style={styles.calEyebrow}>Eaten</Text>
          <View style={styles.heroRow}>
            <Text style={styles.calHero} maxFontSizeMultiplier={MAX_SCALE}>
              {int(consumed.kcal)}
            </Text>
            <Text style={styles.heroUnit}>kcal</Text>
          </View>
          {left != null ? (
            left >= 0 ? (
              <Text style={styles.calLeftText}>{int(left)} kcal left</Text>
            ) : (
              <Text style={[styles.calLeftText, styles.calOver]}>{int(-left)} kcal over</Text>
            )
          ) : null}
        </View>

        <View
          style={styles.ring}
          accessible
          accessibilityLabel={target != null ? `${pct}% of your daily calories` : 'No calorie goal set'}
        >
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle cx={c} cy={c} r={RING_R} fill="none" stroke={colors.energyTrack} strokeWidth={RING_STROKE} />
            {calRatio > 0 ? (
              <Circle
                cx={c}
                cy={c}
                r={RING_R}
                fill="none"
                stroke={over ? colors.over : colors.energy}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${RING_C}`}
                strokeDashoffset={RING_C * (1 - Math.min(1, calRatio))}
                transform={`rotate(-90 ${c} ${c})`}
              />
            ) : null}
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={[styles.ringPct, over && styles.calOver]} maxFontSizeMultiplier={MAX_SCALE}>
              {target != null ? `${pct}%` : '—'}
            </Text>
          </View>
        </View>
      </View>

      <Hairline style={styles.calHairline} />

      <View style={styles.macroCols}>
        {macros.map((m, i) => (
          <Fragment key={m.name}>
            {i > 0 ? <View style={styles.macroSep} /> : null}
            <View style={[styles.macroCol, i === 0 && styles.macroColFirst]}>
              <Text
                style={[styles.macroLabel, { color: m.color }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={MAX_SCALE}
              >
                {m.name}
              </Text>
              <View style={styles.macroValRow}>
                <Text style={styles.macroVal} maxFontSizeMultiplier={MAX_SCALE}>
                  {Math.round(m.value)}
                </Text>
                <Text style={styles.macroUnit} maxFontSizeMultiplier={MAX_SCALE}>g</Text>
              </View>
              <Text style={styles.macroOf} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                {m.target != null ? `of ${Math.round(m.target)} g` : 'no target'}
              </Text>
              <View style={styles.macroTrack}>
                <View
                  style={[
                    styles.macroFill,
                    { width: clampPercent(ratio(m.value, m.target)), backgroundColor: m.color },
                  ]}
                />
              </View>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );
}
