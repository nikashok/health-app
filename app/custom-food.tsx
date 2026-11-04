import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  deleteCustomFood,
  getCustomFood,
  insertCustomFood,
  updateCustomFood,
} from '@/db/customFoods';
import { lookupNutrition, type NutritionLookup } from '@/db/nutritionLookup';
import { confirmDestructive } from '@/lib/confirm';
import type { MealType } from '@/types/db';
import {
  Card,
  DestructiveButton,
  formScrollProps,
  GroupFooter,
  GroupHeader,
  PrimaryButton,
  Row,
  TintButton,
} from '@/ui/components';
import { colors, radius, type } from '@/ui/theme';
import { showError, showToast } from '@/ui/toast';

/**
 * Custom food screen. Two modes:
 *  - ADD (CUST-1): no `code` param. Name + calories required; on save the food is
 *    stored and we jump straight to logging it for the current meal + date.
 *  - EDIT: a `code` param. Loads the existing food, lets you change its details or
 *    delete it, then returns. Editing only affects FUTURE logs — past diary entries
 *    keep their nutrition snapshot (CLAUDE.md rule 2).
 */
export default function CustomFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    meal?: MealType;
    date?: string;
    code?: string;
    origin?: string;
  }>();
  const editCode = params.code ?? null;
  const isEdit = editCode !== null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carb, setCarb] = useState('');
  const [fibre, setFibre] = useState('');
  const [measureName, setMeasureName] = useState('');
  const [measureGrams, setMeasureGrams] = useState('');
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<NutritionLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Edit mode: prefill from the stored food.
  useEffect(() => {
    if (!editCode) return;
    let active = true;
    getCustomFood(editCode).then((f) => {
      if (!active || !f) return;
      setName(f.name);
      setKcal(String(f.energy_kcal));
      setProtein(numStr(f.protein_g));
      setFat(numStr(f.fat_g));
      setCarb(numStr(f.carb_g));
      setFibre(numStr(f.fibre_g));
      setMeasureName(f.default_measure_name ?? '');
      setMeasureGrams(numStr(f.default_grams_per_unit));
    });
    return () => {
      active = false;
    };
  }, [editCode]);

  const energy = parseFloat(kcal);
  const canSave = name.trim().length > 0 && energy >= 0 && !Number.isNaN(energy);
  const canLookup = name.trim().length >= 2 && !looking && !saving;

  // Ask the AI lookup for per-100g nutrition and pre-fill the macro fields. The user
  // still reviews and saves — nothing is committed here.
  async function onLookup() {
    if (!canLookup) return;
    setLooking(true);
    setLookupError(null);
    try {
      const r = await lookupNutrition(name.trim(), description.trim());
      setKcal(String(r.energy_kcal));
      setProtein(String(r.protein_g));
      setCarb(String(r.carb_g));
      setFat(String(r.fat_g));
      setFibre(String(r.fibre_g));
      setLookup(r);
    } catch (e) {
      setLookup(null);
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLooking(false);
    }
  }

  async function onSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const grams = parseFloat(measureGrams);
      const fields = {
        name: name.trim(),
        energy_kcal: energy,
        protein_g: num(protein),
        fat_g: num(fat),
        carb_g: num(carb),
        fibre_g: num(fibre),
        default_measure_name: measureName.trim() || null,
        default_grams_per_unit: grams > 0 ? grams : null,
      };
      if (isEdit) {
        await updateCustomFood(editCode, fields);
        showToast('Custom food updated');
        router.back();
      } else {
        const code = await insertCustomFood(fields);
        // Straight into logging the food we just created.
        router.replace({
          pathname: '/log-entry',
          params: {
            code,
            table: 'custom',
            meal: params.meal ?? 'breakfast',
            date: params.date ?? today(),
            ...(params.origin ? { origin: params.origin } : {}),
          },
        });
      }
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editCode) return;
    confirmDestructive(
      'Delete custom food?',
      'It will no longer appear in search. Past diary entries are unaffected.',
      'Delete',
      async () => {
        try {
          await deleteCustomFood(editCode);
          showToast('Custom food deleted');
          router.back();
        } catch (e) {
          showError(e, 'Couldn’t delete — try again');
        }
      }
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} {...formScrollProps}>
      <GroupHeader style={styles.firstHeader}>Food</GroupHeader>
      <Card>
        <InputRow first label="Name" value={name} onChangeText={setName} placeholder="e.g. Mom’s rajma" />
        <InputRow label="Calories / 100 g" value={kcal} onChangeText={setKcal} placeholder="0" suffix="kcal" numeric />
      </Card>
      <GroupFooter>
        Name and calories are required. Every value on this screen is per 100 g of the food,
        not per serving.
      </GroupFooter>

      <GroupHeader>Describe it (optional)</GroupHeader>
      <TextInput
        style={styles.descInput}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. homemade rajma, thick gravy, ~1 tbsp oil per serving"
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.leaf}
        numberOfLines={1}
      />

      <TintButton
        title={looking ? 'Searching credible sources…' : 'Look Up Nutrition'}
        onPress={onLookup}
        disabled={!canLookup}
        hint={!looking && name.trim().length < 2 ? 'Enter a food name to look up its nutrition.' : null}
        style={styles.lookup}
      />
      {lookupError ? <Text style={styles.lookupError}>{lookupError}</Text> : null}
      {lookup ? (
        <View style={styles.lookupInfo}>
          <Text style={styles.lookupSource}>
            Pre-filled from {lookup.source} · {lookup.confidence} confidence
          </Text>
          {lookup.basis_note ? <Text style={styles.lookupNote}>{lookup.basis_note}</Text> : null}
          {lookup.sources.length > 0 ? (
            <View style={styles.sources}>
              <Text style={styles.sourcesLabel}>SOURCES</Text>
              {lookup.sources.map((s) => (
                <Pressable key={s.url} onPress={() => Linking.openURL(s.url)} hitSlop={4}>
                  <Text style={styles.sourceLink} numberOfLines={1}>
                    ↗ {s.title || s.url}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.lookupCaution}>AI estimate — review the numbers and sources before saving.</Text>
          {!lookup.sane ? (
            <Text style={styles.lookupWarn}>
              Calories look inconsistent with the macros — please double-check.
            </Text>
          ) : null}
        </View>
      ) : null}

      <GroupHeader>Macros per 100 g (optional)</GroupHeader>
      <Card>
        <InputRow first label="Protein" labelColor={colors.protein} value={protein} onChangeText={setProtein} placeholder="0" suffix="g" numeric />
        <InputRow label="Carbs" labelColor={colors.carbs} value={carb} onChangeText={setCarb} placeholder="0" suffix="g" numeric />
        <InputRow label="Fat" labelColor={colors.fat} value={fat} onChangeText={setFat} placeholder="0" suffix="g" numeric />
        <InputRow label="Fibre" labelColor={colors.fibre} value={fibre} onChangeText={setFibre} placeholder="0" suffix="g" numeric />
      </Card>

      <GroupHeader>Default measure (optional)</GroupHeader>
      <Card>
        <InputRow first label="Measure" value={measureName} onChangeText={setMeasureName} placeholder="bowl" autoCapitalize="none" />
        <InputRow label="Grams / unit" value={measureGrams} onChangeText={setMeasureGrams} placeholder="0" suffix="g" numeric />
      </Card>

      <PrimaryButton
        title={saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save & Log'}
        onPress={onSave}
        disabled={!canSave || saving}
        hint={!canSave ? 'Add a name and calories to save.' : null}
        style={styles.save}
      />
      {isEdit ? (
        <DestructiveButton title="Delete Custom Food" onPress={onDelete} style={styles.delete} />
      ) : null}
    </ScrollView>
  );
}

function InputRow({
  label,
  labelColor,
  value,
  onChangeText,
  placeholder,
  suffix,
  numeric,
  first,
  autoCapitalize,
}: {
  label: string;
  labelColor?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  suffix?: string;
  numeric?: boolean;
  first?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <Row first={first}>
      <Text style={[styles.label, labelColor ? { color: labelColor } : null]}>{label}</Text>
      <View style={styles.valueWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.leaf}
          keyboardType={numeric ? 'numeric' : 'default'}
          inputMode={numeric ? 'decimal' : 'text'}
          autoCapitalize={autoCapitalize}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </Row>
  );
}

function num(s: string): number | null {
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}
function numStr(n: number | null): string {
  return n != null ? String(n) : '';
}
/** Local calendar date (toISOString is UTC, which is still "yesterday" before 5:30 am IST). */
function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  firstHeader: { marginTop: 12 },
  label: { ...type.body, color: colors.ink, marginRight: 12 },
  valueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  input: { ...type.body, color: colors.ink, flex: 1, textAlign: 'right', paddingVertical: 0 },
  suffix: { ...type.body, color: colors.muted },
  save: { marginTop: 24 },
  delete: { marginTop: 8 },
  descInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 16, // 16+ stops iOS Safari zooming the page when the field is focused
    lineHeight: 20,
    color: colors.ink,
  },
  lookup: { marginTop: 12 },
  lookupError: { ...type.footnote, color: colors.rose, marginTop: 8, marginHorizontal: 16 },
  lookupInfo: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 6,
  },
  lookupSource: { ...type.subhead, color: colors.leaf, fontWeight: '600' },
  lookupNote: { ...type.footnote, color: colors.muted, lineHeight: 18 },
  sources: { marginTop: 4, gap: 6 },
  sourcesLabel: { ...type.caption, color: colors.muted, fontWeight: '600', letterSpacing: 0.4 },
  sourceLink: { ...type.footnote, color: colors.leaf },
  lookupCaution: { ...type.footnote, color: colors.muted, marginTop: 2 },
  lookupWarn: { ...type.footnote, color: colors.energy },
});
