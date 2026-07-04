import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import type { Totals } from '@/calc/dayTotals';
import type { UserProfile } from '@/types/db';
import { dark as D } from '@/ui/theme';

import { styles } from './styles';

/** Protein / Carbs / Fat / Fibre progress bars for today's consumed macros. */
export function MacrosCard({ consumed, profile }: { consumed: Totals; profile: UserProfile }) {
  return (
    <View style={[styles.card, styles.macrosCard]}>
      <Text style={styles.sectionInCard}>Macros</Text>
      <MacroBar
        label="Protein"
        value={consumed.protein_g}
        targetVal={profile.target_protein_g}
        gradColors={[D.orange, D.orange2]}
      />
      <MacroBar
        label="Carbs"
        value={consumed.carb_g}
        targetVal={profile.target_carb_g}
        gradColors={[D.cyan, D.cyan2]}
      />
      <MacroBar
        label="Fat"
        value={consumed.fat_g}
        targetVal={profile.target_fat_g}
        gradColors={[D.orange, D.orange2]}
        overColor="#ff9f6b"
      />
      <MacroBar
        label="Fibre"
        value={consumed.fibre_g}
        targetVal={30}
        gradColors={[D.green, D.green2]}
        last
      />
    </View>
  );
}

function MacroBar({
  label,
  value,
  targetVal,
  gradColors,
  overColor,
  last,
}: {
  label: string;
  value: number;
  targetVal: number | null;
  gradColors: [string, string];
  overColor?: string;
  last?: boolean;
}) {
  const r = targetVal ? Math.min(1, value / targetVal) : 0;
  const over = targetVal != null && value > targetVal;
  const overAmt = over ? Math.round(value - targetVal!) : 0;

  return (
    <View style={[styles.macroRow, !last && styles.macroRowGap]}>
      <View style={styles.macroHead}>
        <View style={styles.macroLabelRow}>
          <Text style={styles.macroLabelTxt}>{label}</Text>
          {over && overColor && (
            <View
              style={[styles.overBadge, { backgroundColor: `${overColor}26` }]}
            >
              <Text style={[styles.overBadgeTxt, { color: overColor }]}>
                {overAmt} over
              </Text>
            </View>
          )}
        </View>
        <Text
          style={[styles.macroVal, over && overColor ? { color: gradColors[1] } : null]}
        >
          {Math.round(value)}
          {targetVal != null ? (
            <Text style={styles.macroTargetTxt}> / {Math.round(targetVal)} g</Text>
          ) : (
            <Text style={styles.macroTargetTxt}> g</Text>
          )}
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <LinearGradient
          colors={gradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.macroFill, { width: `${Math.round(r * 100)}%` }]}
        />
      </View>
    </View>
  );
}
