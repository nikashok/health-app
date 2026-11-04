/**
 * One day's calories (hero number + ring) and the four macro columns against targets.
 * Used by Today and by Diary for any date, so the two screens always read the same way.
 *
 * `totals` is what the hero counts: food EATEN on today/past days (status='logged' only),
 * or the PLAN on a future day. Unconfirmed plans on today/past days never join the eaten
 * figure (CLAUDE.md rule 3) — pass them as `pendingPlan` and they're shown beside it.
 */
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Circle, Svg } from 'react-native-svg';

import type { Totals } from '@/calc/dayTotals';
import { ratio } from '@/calc/insights';
import type { UserProfile } from '@/types/db';
import { CardHeader, Hairline } from '@/ui/components';
import { int } from '@/ui/format';
import { clampPercent, colors, heroNumber, radius, type } from '@/ui/theme';

/** Fibre has no profile target; 30 g is the general adult guideline. */
export const FIBRE_TARGET_G = 30;

const RING_SIZE = 104;
const RING_STROKE = 15;
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;
/** Big numbers stop growing past this text-size multiplier, so the columns can't clip. */
const MAX_SCALE = 1.3;

export function DaySummaryCard({
  totals,
  profile,
  mode = 'eaten',
  pendingPlan,
  onGoalPress,
  footer,
  style,
}: {
  totals: Totals;
  profile: UserProfile | null;
  mode?: 'eaten' | 'planned';
  /** Today/past only: planned-but-unconfirmed kcal, and the projected day total (today). */
  pendingPlan?: { kcal: number; projected: number | null } | null;
  onGoalPress?: () => void;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const target = profile?.target_kcal ?? null;
  const calRatio = ratio(totals.kcal, target);
  const left = target != null ? target - totals.kcal : null;
  const over = calRatio > 1;
  const pct = Math.round(calRatio * 100);
  const c = RING_SIZE / 2;

  const macros = [
    { name: 'Protein', value: totals.protein_g, target: profile?.target_protein_g ?? null, color: colors.protein },
    { name: 'Carbs', value: totals.carb_g, target: profile?.target_carb_g ?? null, color: colors.carbs },
    { name: 'Fat', value: totals.fat_g, target: profile?.target_fat_g ?? null, color: colors.fat },
    { name: 'Fibre', value: totals.fibre_g, target: FIBRE_TARGET_G, color: colors.fibre },
  ];

  return (
    <View style={[styles.card, style]}>
      <CardHeader
        label="Calories"
        color={colors.energy}
        detail={target != null ? `Goal ${int(target)}` : 'Set goal'}
        onPress={onGoalPress}
      />

      <View style={styles.body}>
        <View style={styles.left}>
          <Text style={styles.eyebrow}>{mode === 'planned' ? 'Planned' : 'Eaten'}</Text>
          <View style={styles.heroRow}>
            <Text style={styles.hero} maxFontSizeMultiplier={MAX_SCALE}>
              {int(totals.kcal)}
            </Text>
            <Text style={styles.heroUnit}>kcal</Text>
          </View>
          {left != null ? (
            left >= 0 ? (
              <Text style={styles.leftText}>{int(left)} kcal left</Text>
            ) : (
              <Text style={[styles.leftText, styles.over]}>{int(-left)} kcal over</Text>
            )
          ) : null}
          {pendingPlan && pendingPlan.kcal > 0 ? (
            <Text style={styles.planned}>
              +{int(pendingPlan.kcal)} kcal planned
              {pendingPlan.projected != null ? ` · projected ${int(pendingPlan.projected)}` : ''}
            </Text>
          ) : null}
        </View>

        <View
          style={styles.ring}
          accessible
          accessibilityLabel={
            target != null
              ? `${pct}% of your daily calories${mode === 'planned' ? ' planned' : ''}`
              : 'No calorie goal set'
          }
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
            <Text style={[styles.ringPct, over && styles.over]} maxFontSizeMultiplier={MAX_SCALE}>
              {target != null ? `${pct}%` : '—'}
            </Text>
          </View>
        </View>
      </View>

      <Hairline style={styles.hairline} />

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
      {footer}
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
  body: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  left: { gap: 2, flexShrink: 1 },
  eyebrow: { ...type.subhead, color: colors.muted },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  hero: { ...heroNumber(44), letterSpacing: -0.5, lineHeight: 50 },
  heroUnit: { fontSize: 17, fontWeight: '600', color: colors.muted },
  leftText: { ...type.subhead, color: colors.ink },
  over: { color: colors.over },
  planned: { ...type.footnote, color: colors.plannedPillText, marginTop: 2 },
  ring: { width: RING_SIZE, height: RING_SIZE },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 17, fontWeight: '700', color: colors.ink },
  hairline: { marginTop: 16, marginBottom: 14 },
  macroCols: { flexDirection: 'row' },
  macroSep: { width: 1, backgroundColor: colors.separator },
  macroCol: { flex: 1, minWidth: 0, paddingLeft: 8, paddingRight: 4, gap: 3 },
  macroColFirst: { paddingLeft: 0 },
  macroLabel: { ...type.footnote, fontWeight: '600' },
  macroValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  macroVal: heroNumber(22),
  macroUnit: { ...type.footnote, fontWeight: '600', color: colors.muted },
  macroOf: { ...type.caption, color: colors.muted },
  macroTrack: { height: 4, borderRadius: 2, backgroundColor: colors.fill, marginTop: 5, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 2 },
});
