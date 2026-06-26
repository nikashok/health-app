import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getMeasurement, getRecentMeasurements, saveMeasurement } from '@/db/measurements';
import type { BodyMeasurement } from '@/types/db';
import { Card, FieldRow, GroupFooter, GroupHeader, PrimaryButton } from '@/ui/components';
import { colors, type } from '@/ui/theme';

/**
 * Log the day's body measurements — weight + waist, once a day. Saving again overwrites
 * today's entry (one row per day). Local-first; the save is backed up to Supabase.
 */
export default function MeasurementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? today();

  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<BodyMeasurement[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [m, r] = await Promise.all([getMeasurement(date), getRecentMeasurements(14)]);
      if (!active) return;
      if (m) {
        setWeight(m.weight_kg != null ? String(m.weight_kg) : '');
        setWaist(m.waist_cm != null ? String(m.waist_cm) : '');
      }
      setRecent(r);
    })();
    return () => {
      active = false;
    };
  }, [date]);

  const w = parseFloat(weight);
  const wa = parseFloat(waist);
  const hasWeight = weight.trim() !== '' && w > 0;
  const hasWaist = waist.trim() !== '' && wa > 0;
  const canSave = (hasWeight || hasWaist) && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveMeasurement(date, {
        weight_kg: hasWeight ? round1(w) : null,
        waist_cm: hasWaist ? round1(wa) : null,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.dateLabel}>{dateLabel(date)}</Text>

      <GroupHeader>Measurements</GroupHeader>
      <Card>
        <FieldRow label="Weight" suffix="kg" first>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            placeholder="0"
            placeholderTextColor={colors.faint}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
          />
        </FieldRow>
        <FieldRow label="Waist" suffix="cm">
          <TextInput
            style={styles.input}
            value={waist}
            onChangeText={setWaist}
            placeholder="0"
            placeholderTextColor={colors.faint}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
          />
        </FieldRow>
      </Card>
      <GroupFooter>Logged once a day — saving again updates today’s entry.</GroupFooter>

      <PrimaryButton
        title={saving ? 'Saving…' : 'Save'}
        onPress={onSave}
        disabled={!canSave}
        style={styles.save}
      />

      {recent.length > 0 ? (
        <>
          <GroupHeader>Recent</GroupHeader>
          <Card>
            {recent.map((m, i) => (
              <View key={m.measured_on} style={[styles.histRow, i > 0 && styles.histDivider]}>
                <Text style={styles.histDate}>{dayjs(m.measured_on).format('ddd, D MMM')}</Text>
                <Text style={styles.histVal}>
                  {m.weight_kg != null ? `${m.weight_kg} kg` : '—'}
                  {'    '}
                  {m.waist_cm != null ? `${m.waist_cm} cm` : '—'}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function today(): string {
  return dayjs().format('YYYY-MM-DD');
}
function dateLabel(date: string): string {
  if (date === today()) return 'Today';
  if (date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return 'Yesterday';
  return dayjs(date).format('ddd, D MMM YYYY');
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  dateLabel: { ...type.title2, color: colors.ink, marginTop: 4 },
  input: {
    ...type.body,
    color: colors.ink,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
    paddingVertical: 0,
  },
  save: { marginTop: 24 },
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  histDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  histDate: { ...type.subhead, color: colors.muted },
  histVal: { ...type.subhead, color: colors.ink, fontWeight: '500' },
});
