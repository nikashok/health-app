import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { macroKcal, macrosDisagree, servingToPer100 } from '@/calc/customFood';
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
  Segmented,
  TintButton,
} from '@/ui/components';
import { int } from '@/ui/format';
import { colors, radius, type } from '@/ui/theme';
import { showError, showToast } from '@/ui/toast';

type Basis = 'per100' | 'serving';
const BASES: { value: Basis; label: string }[] = [
  { value: 'per100', label: 'Per 100 g' },
  { value: 'serving', label: 'Per serving' },
];

/**
 * Custom food screen. Two modes:
 *  - ADD (CUST-1): no `code` param. Name + calories required; on save the food is
 *    stored and we jump straight to logging it for the current meal + date.
 *  - EDIT: a `code` param. Loads the existing food, lets you change its details or
 *    delete it, then returns. Editing only affects FUTURE logs — past diary entries
 *    keep their nutrition snapshot (CLAUDE.md rule 2).
 * Values can be typed per 100 g or per serving (a pack label, a recipe portion); they
 * are always stored per 100 g (CLAUDE.md rule 1).
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
  const [basis, setBasis] = useState<Basis>('per100');
  const [servingGrams, setServingGrams] = useState('');
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

  // Edit mode: prefill from the stored (per-100 g) food.
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
  const serving = parseFloat(servingGrams);
  const typed = { kcal: energy, protein: num(protein), carb: num(carb), fat: num(fat), fibre: num(fibre) };
  const basisOk = basis === 'per100' || serving > 0;
  const canSave = name.trim().length > 0 && energy >= 0 && !Number.isNaN(energy) && basisOk;
  const canLookup = name.trim().length >= 2 && !looking && !saving;
  const implied = macroKcal(typed);
  const mismatch = energy > 0 && macrosDisagree(typed);
  const unitLabel = basis === 'per100' ? 'per 100 g' : serving > 0 ? `per ${int(serving)} g serving` : 'per serving';

  // Ask the AI lookup for per-100g nutrition and pre-fill the fields. The user still
  // reviews and saves — nothing is committed here.
  async function onLookup() {
    if (!canLookup) return;
    setLooking(true);
    setLookupError(null);
    try {
      const r = await lookupNutrition(name.trim(), description.trim());
      setBasis('per100'); // the lookup always answers per 100 g
      setKcal(String(r.energy_kcal));
      setProtein(String(r.protein_g));
      setCarb(String(r.carb_g));
      setFat(String(r.fat_g));
      setFibre(String(r.fibre_g));
      setLookup(r);
    } catch (e) {
      setLookup(null);
      setLookupError(friendlyLookupError(e));
    } finally {
      setLooking(false);
    }
  }

  async function onSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // Always store per 100 g; a per-serving entry is converted, and its serving becomes
      // the default measure if none was given.
      const per100 = basis === 'serving' ? servingToPer100(typed, serving) : typed;
      const grams = parseFloat(measureGrams);
      const ownMeasure = measureName.trim();
      const fields = {
        name: name.trim(),
        energy_kcal: per100.kcal,
        protein_g: per100.protein,
        fat_g: per100.fat,
        carb_g: per100.carb,
        fibre_g: per100.fibre,
        default_measure_name: ownMeasure || (basis === 'serving' ? 'serving' : null),
        default_grams_per_unit: ownMeasure && grams > 0 ? grams : basis === 'serving' ? serving : null,
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
      </Card>

      <GroupHeader>Describe it (optional)</GroupHeader>
      <TextInput
        style={styles.descInput}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. homemade rajma, thick gravy, ~1 tbsp oil per serving"
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.leaf}
        numberOfLines={1}
        accessibilityLabel="Description for the nutrition lookup"
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
                <Pressable
                  key={s.url}
                  onPress={() => Linking.openURL(s.url)}
                  hitSlop={8}
                  accessibilityRole="link"
                >
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

      <GroupHeader>Nutrition</GroupHeader>
      <Segmented options={BASES} value={basis} onChange={setBasis} />
      <Card style={styles.nutritionCard}>
        {basis === 'serving' ? (
          <InputRow first label="Serving size" value={servingGrams} onChangeText={setServingGrams} placeholder="0" suffix="g" numeric />
        ) : null}
        <InputRow first={basis === 'per100'} label="Calories" labelColor={colors.energy} value={kcal} onChangeText={setKcal} placeholder="0" suffix="kcal" numeric />
        <InputRow label="Protein" labelColor={colors.protein} value={protein} onChangeText={setProtein} placeholder="0" suffix="g" numeric />
        <InputRow label="Carbs" labelColor={colors.carbs} value={carb} onChangeText={setCarb} placeholder="0" suffix="g" numeric />
        <InputRow label="Fat" labelColor={colors.fat} value={fat} onChangeText={setFat} placeholder="0" suffix="g" numeric />
        <InputRow label="Fibre" labelColor={colors.fibre} value={fibre} onChangeText={setFibre} placeholder="0" suffix="g" numeric />
      </Card>
      {mismatch && implied != null ? (
        <Text style={styles.mismatch}>
          These macros add up to about {int(implied)} kcal, but calories say {int(energy)}. Worth a
          second look.
        </Text>
      ) : null}
      <GroupFooter>
        Name and calories are required; macros are optional. All values are {unitLabel}
        {basis === 'serving' ? ' and saved per 100 g' : ''}.
      </GroupFooter>

      <GroupHeader>Default measure (optional)</GroupHeader>
      <Card>
        <InputRow first label="Measure" value={measureName} onChangeText={setMeasureName} placeholder={basis === 'serving' ? 'serving' : 'bowl'} autoCapitalize="none" />
        <InputRow label="Grams / unit" value={measureGrams} onChangeText={setMeasureGrams} placeholder={basis === 'serving' && serving > 0 ? String(serving) : '0'} suffix="g" numeric />
      </Card>

      <PrimaryButton
        title={saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save & Log'}
        onPress={onSave}
        disabled={!canSave || saving}
        hint={
          !canSave
            ? !basisOk
              ? 'Enter the serving size in grams to save.'
              : 'Add a name and calories to save.'
            : null
        }
        style={styles.save}
      />
      {isEdit ? (
        <DestructiveButton title="Delete Custom Food" onPress={onDelete} style={styles.delete} />
      ) : null}
    </ScrollView>
  );
}

/** Plain-language lookup failures — the form still works by hand either way. */
function friendlyLookupError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not signed in|\(401\)|\(403\)/i.test(msg)) return 'Your session has expired — sign in again to use the lookup.';
  if (/\(429\)/.test(msg)) return 'Too many lookups just now — try again in a minute.';
  if (/\(504\)|timeout|timed out/i.test(msg)) return 'The lookup took too long — try again, or enter the values yourself.';
  if (/reach the lookup service/i.test(msg)) return msg;
  return 'The lookup didn’t work this time — you can still enter the values yourself.';
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
          accessibilityLabel={suffix ? `${label} in ${suffix}` : label}
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
  nutritionCard: { marginTop: 10 },
  mismatch: { ...type.footnote, color: colors.energy, marginTop: 8, marginHorizontal: 16, lineHeight: 18 },
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
