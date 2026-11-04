import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { consumedTotals, plannedTotals } from '@/calc/dayTotals';
import { gramsTotal, snapshotNutrition } from '@/calc/logEntry';
import { isFavorite, setFavorite } from '@/db/favorites';
import { getEntriesForDate, getLastPortion, logFood } from '@/db/logEntries';
import { getProfile } from '@/db/profile';
import { loadFoodForLogging } from '@/db/quickLog';
import type { MeasureOption } from '@/db/measures';
import type { SearchResult } from '@/db/search';
import { kindToTable, type FoodKind } from '@/db/searchSql';
import type { MealType } from '@/types/db';
import {
  Card,
  formScrollProps,
  GroupHeader,
  PrimaryButton,
  Segmented,
  STICKY_FOOTER_SPACE,
  StickyFooter,
} from '@/ui/components';
import { displayFoodName } from '@/ui/foodName';
import { int, numberText } from '@/ui/format';
import { Icon } from '@/ui/icons';
import { MEAL_OPTS } from '@/ui/meals';
import { NutritionPreview, PortionPicker, type DayImpact } from '@/ui/portion';
import { initialQty, pickerMeasures } from '@/ui/quantity';
import { colors, type } from '@/ui/theme';
import { showError, showToast } from '@/ui/toast';

export default function LogEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code: string;
    table: FoodKind;
    meal?: MealType;
    date?: string;
    origin?: string; // 'home' when the flow started on Today
  }>();
  const date = params.date ?? today();
  const isPlan = date > today();

  // The caller's meal (inferred from the time of day) is only a starting point — it is
  // editable here so the meal is always a deliberate choice before the entry is saved.
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'breakfast');
  const [food, setFood] = useState<SearchResult | null | undefined>(undefined);
  const [measures, setMeasures] = useState<MeasureOption[]>([]);
  const [selected, setSelected] = useState<MeasureOption | null>(null);
  const [lastMeasure, setLastMeasure] = useState<string | null>(null);
  const [qty, setQty] = useState('1');
  const [impact, setImpact] = useState<DayImpact | null>(null);
  const [saving, setSaving] = useState(false);
  const [starred, setStarred] = useState(false);
  const picked = useRef(false);

  // Reload on focus so returning from "Edit details" shows the new values.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [{ food: f, options }, last, entries, profile, fav] = await Promise.all([
          loadFoodForLogging(params.code, params.table),
          getLastPortion(kindToTable(params.table), params.code),
          getEntriesForDate(date),
          getProfile(),
          isFavorite({ kind: params.table, code: params.code }),
        ]);
        if (!active) return;
        setStarred(fav);
        // Grams leads and is selected, unless a custom food has its own saved default.
        const picker = pickerMeasures(options, params.table === 'custom');
        setFood(f ?? null);
        setMeasures(picker.options);
        const day = isPlan ? plannedTotals(entries) : consumedTotals(entries);
        setImpact({
          label: isPlan
            ? `Planned for ${dayjs(date).format('ddd D MMM')}`
            : date === today()
              ? 'Today'
              : dayjs(date).format('ddd D MMM'),
          before: day.kcal,
          target: profile?.target_kcal ?? null,
        });
        // Keep the user's choice when refocusing (e.g. back from Edit details). A food
        // you've logged before opens with how you last logged it, wherever you found it.
        if (!picked.current) {
          picked.current = true;
          const lastOpt = last ? picker.options.find((o) => o.measure_name === last.measure_name) : undefined;
          if (last && lastOpt && last.quantity > 0) {
            setSelected(lastOpt);
            setQty(String(last.quantity));
            setLastMeasure(lastOpt.measure_name);
          } else {
            setSelected(picker.selected);
            setQty(initialQty(picker.selected));
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [params.code, params.table, date, isPlan])
  );

  const quantity = parseFloat(qty);
  const preview = useMemo(() => {
    if (!food || !selected || !(quantity > 0)) return null;
    const totalGrams = gramsTotal(quantity, selected.grams_per_unit);
    return { grams: totalGrams, ...snapshotNutrition(food, totalGrams) };
  }, [food, selected, quantity]);

  async function toggleStar() {
    if (!food) return;
    const next = !starred;
    setStarred(next);
    try {
      await setFavorite(food, next);
      showToast(next ? 'Added to favourites' : 'Removed from favourites');
    } catch (e) {
      setStarred(!next);
      showError(e);
    }
  }

  async function onSave() {
    if (!food || !selected || !preview || saving) return;
    setSaving(true);
    try {
      await logFood({
        food,
        measureName: selected.measure_name,
        gramsPerUnit: selected.grams_per_unit,
        quantity,
        meal,
        date,
        status: isPlan ? 'planned' : 'logged',
      });
      showToast(`${isPlan ? 'Planned' : 'Logged'} ${displayFoodName(food.name, food.kind)}`);
      // Return to where the flow started: Today, or the screen before Add Food (usually Diary).
      if (params.origin === 'home') router.dismissAll();
      else if (router.canDismiss()) router.dismiss(2);
      else router.replace({ pathname: '/diary', params: { date } });
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  }

  if (food === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
      </View>
    );
  }
  if (food === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not load that food</Text>
        <PrimaryButton title="Back to search" onPress={() => router.back()} style={styles.errorButton} />
      </View>
    );
  }

  const action = isPlan ? 'Save Plan' : 'Log Food';
  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} {...formScrollProps}>
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.eyebrow}>{kindLabel(food.kind).toUpperCase()}</Text>
            <View style={styles.titleActions}>
              {food.kind === 'custom' ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/custom-food', params: { code: food.code } })}
                  hitSlop={12}
                  accessibilityRole="button"
                >
                  <Text style={styles.editLink}>Edit details</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={toggleStar}
                style={styles.star}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: starred }}
                accessibilityLabel={starred ? 'Remove from favourites' : 'Add to favourites'}
              >
                <Icon name={starred ? 'star-filled' : 'star'} size={24} color={starred ? colors.star : colors.muted} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.name}>{displayFoodName(food.name, food.kind)}</Text>
          <Text style={styles.meta}>
            {numberText(food.energy_kcal)} kcal/100 g · {dayjs(date).format('D MMM YYYY')}
          </Text>
        </View>

        {isPlan ? (
          <Card style={styles.planBanner}>
            <Text style={styles.planTitle}>This will be saved as a plan</Text>
            <Text style={styles.planBody}>
              It will not count as intake until you confirm it from Today or the Diary.
            </Text>
          </Card>
        ) : null}

        <GroupHeader>Meal</GroupHeader>
        <Segmented options={MEAL_OPTS} value={meal} onChange={setMeal} />

        <PortionPicker
          foodName={food.name}
          options={measures}
          selected={selected}
          setSelected={setSelected}
          qty={qty}
          setQty={setQty}
          keep={[lastMeasure]}
        />

        <NutritionPreview preview={preview} impact={impact} />
      </ScrollView>

      <StickyFooter>
        <PrimaryButton
          title={saving ? 'Saving…' : preview ? `${action} · ${int(preview.kcal)} kcal` : action}
          onPress={onSave}
          disabled={!preview || saving}
        />
      </StickyFooter>
    </View>
  );
}

function today(): string {
  return dayjs().format('YYYY-MM-DD');
}
function kindLabel(k: FoodKind): string {
  return k === 'cooked' ? 'Dish' : k === 'raw' ? 'Raw ingredient' : 'Custom food';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: STICKY_FOOTER_SPACE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  errorTitle: { ...type.title3, color: colors.ink, marginBottom: 16 },
  errorButton: { alignSelf: 'stretch', paddingHorizontal: 18 },
  titleBlock: { paddingHorizontal: 4, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 },
  eyebrow: { ...type.footnote, color: colors.muted, fontWeight: '600', letterSpacing: 0.2 },
  editLink: { ...type.subhead, color: colors.leaf },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  star: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  name: { ...type.title1, color: colors.ink },
  meta: { ...type.subhead, color: colors.muted },
  planBanner: { marginTop: 18, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.saffronBg },
  planTitle: { ...type.headline, color: colors.saffron },
  planBody: { ...type.footnote, color: colors.ink, marginTop: 4, lineHeight: 18 },
});
