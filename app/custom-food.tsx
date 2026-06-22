import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  deleteCustomFood,
  getCustomFood,
  insertCustomFood,
  updateCustomFood,
} from '@/db/customFoods';
import { confirmDestructive } from '@/lib/confirm';
import type { MealType } from '@/types/db';
import { Card, GroupFooter, GroupHeader, PrimaryButton, Row } from '@/ui/components';
import { colors, type } from '@/ui/theme';

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
  const params = useLocalSearchParams<{ meal?: MealType; date?: string; code?: string }>();
  const editCode = params.code ?? null;
  const isEdit = editCode !== null;

  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carb, setCarb] = useState('');
  const [fibre, setFibre] = useState('');
  const [measureName, setMeasureName] = useState('');
  const [measureGrams, setMeasureGrams] = useState('');
  const [saving, setSaving] = useState(false);

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
        router.back();
      } else {
        const code = await insertCustomFood(fields);
        // Straight into logging the food we just created.
        router.replace({
          pathname: '/log-entry',
          params: { code, table: 'custom', meal: params.meal ?? 'breakfast', date: params.date ?? today() },
        });
      }
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
        await deleteCustomFood(editCode);
        router.back();
      }
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <GroupHeader>Food</GroupHeader>
      <Card>
        <InputRow first label="Name" value={name} onChangeText={setName} placeholder="e.g. Mom’s rajma" />
        <InputRow label="Calories" value={kcal} onChangeText={setKcal} placeholder="0" suffix="Cal" numeric />
      </Card>
      <GroupFooter>Name and calories are required. Everything below is per 100 g.</GroupFooter>

      <GroupHeader>Macros (optional)</GroupHeader>
      <Card>
        <InputRow first label="Protein" value={protein} onChangeText={setProtein} placeholder="0" suffix="g" numeric />
        <InputRow label="Carbs" value={carb} onChangeText={setCarb} placeholder="0" suffix="g" numeric />
        <InputRow label="Fat" value={fat} onChangeText={setFat} placeholder="0" suffix="g" numeric />
        <InputRow label="Fibre" value={fibre} onChangeText={setFibre} placeholder="0" suffix="g" numeric />
      </Card>

      <GroupHeader>Default measure (optional)</GroupHeader>
      <Card>
        <InputRow first label="Measure" value={measureName} onChangeText={setMeasureName} placeholder="bowl" autoCapitalize="none" />
        <InputRow label="Grams / unit" value={measureGrams} onChangeText={setMeasureGrams} placeholder="0" suffix="g" numeric />
      </Card>

      <PrimaryButton
        title={saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save & log'}
        onPress={onSave}
        disabled={!canSave || saving}
        style={styles.save}
      />
      {isEdit ? (
        <Pressable style={styles.delete} onPress={onDelete}>
          <Text style={styles.deleteText}>Delete custom food</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  suffix,
  numeric,
  first,
  autoCapitalize,
}: {
  label: string;
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
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
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
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  label: { ...type.body, color: colors.ink, marginRight: 12 },
  valueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  input: { ...type.body, color: colors.ink, flex: 1, textAlign: 'right', paddingVertical: 0 },
  suffix: { ...type.body, color: colors.muted },
  save: { marginTop: 24 },
  delete: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  deleteText: { ...type.body, color: colors.rose, fontWeight: '500' },
});
