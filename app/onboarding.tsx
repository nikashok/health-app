import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  computeTargets,
  type ActivityLevel,
  type Goal,
  type ProfileInput,
  type Sex,
  type Targets,
} from '@/calc/targets';
import { getProfile, saveProfile } from '@/db/profile';
import { Card, Chip, formScrollProps, GroupFooter, GroupHeader, PrimaryButton, Row, Segmented } from '@/ui/components';
import { int } from '@/ui/format';
import { HomeButton } from '@/ui/HomeButton';
import { showError, showToast } from '@/ui/toast';
import { colors, heroNumber, type } from '@/ui/theme';

const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
const ACTIVITIES: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];
const GOALS: { value: Goal; label: string }[] = [
  { value: 'lose', label: 'Lose' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain' },
];
const TARGET_FIELDS: { key: keyof Targets; label: string; suffix: string; color: string }[] = [
  { key: 'target_kcal', label: 'Calories', suffix: 'kcal', color: colors.energy },
  { key: 'target_protein_g', label: 'Protein', suffix: 'g', color: colors.protein },
  { key: 'target_carb_g', label: 'Carbs', suffix: 'g', color: colors.carbs },
  { key: 'target_fat_g', label: 'Fat', suffix: 'g', color: colors.fat },
];

export default function OnboardingScreen() {
  const router = useRouter();
  // `weight` arrives from Today's "Update your targets?" nudge (the current trend weight).
  const params = useLocalSearchParams<{ weight?: string }>();
  const [weightFromTrend, setWeightFromTrend] = useState(false);

  // Pre-selected defaults so the segmented controls / chips read as a complete iOS
  // form (a segment is always active). The user can change any of them.
  const [sex, setSex] = useState<Sex | null>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>('moderate');
  const [goal, setGoal] = useState<Goal | null>('maintain');
  const [override, setOverride] = useState(false);
  const [manualTargets, setManualTargets] = useState<Record<keyof Targets, string>>({
    target_kcal: '',
    target_protein_g: '',
    target_carb_g: '',
    target_fat_g: '',
  });
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  // First run (no profile yet) has no Home to return to — it redirects straight back here.
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    getProfile().then((p) => {
      if (!p) return;
      setHasProfile(true);
      if (p.sex) setSex(p.sex as Sex);
      if (p.age != null) setAge(String(p.age));
      if (p.height_cm != null) setHeight(String(p.height_cm));
      if (p.weight_kg != null) setWeight(String(p.weight_kg));
      if (p.activity_level) setActivity(p.activity_level as ActivityLevel);
      if (p.goal) setGoal(p.goal as Goal);
      if (params.weight && parseFloat(params.weight) > 0) {
        setWeight(params.weight);
        setWeightFromTrend(true);
      }
      if (p.targets_source === 'manual') {
        setOverride(true);
        setManualTargets({
          target_kcal: numStr(p.target_kcal),
          target_protein_g: numStr(p.target_protein_g),
          target_carb_g: numStr(p.target_carb_g),
          target_fat_g: numStr(p.target_fat_g),
        });
      }
    });
  }, []);

  const ageNum = parseFloat(age);
  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);
  const touch = (set: (v: string) => void) => (v: string) => {
    setTouched(true);
    set(v);
  };
  const formError = firstFormError({ sex, ageNum, heightNum, weightNum, activity, goal });

  const profileInput = useMemo<ProfileInput | null>(() => {
    if (formError) return null;
    return {
      sex: sex!,
      age: ageNum,
      height_cm: heightNum,
      weight_kg: weightNum,
      activity_level: activity!,
      goal: goal!,
    };
  }, [activity, ageNum, formError, goal, heightNum, sex, weightNum]);

  const computed = useMemo(
    () => (profileInput ? computeTargets(profileInput) : null),
    [profileInput]
  );

  function toggleOverride(on: boolean) {
    setOverride(on);
    if (on && computed) {
      setManualTargets({
        target_kcal: String(computed.target_kcal),
        target_protein_g: String(computed.target_protein_g),
        target_carb_g: String(computed.target_carb_g),
        target_fat_g: String(computed.target_fat_g),
      });
    }
  }

  const manualError = override ? firstManualError(manualTargets) : null;
  const canSave = !!profileInput && !manualError;

  async function onSave() {
    if (!profileInput || manualError || saving) return;
    setSaving(true);
    try {
      const targets: Targets = override
        ? {
            target_kcal: parseFloat(manualTargets.target_kcal),
            target_protein_g: parseFloat(manualTargets.target_protein_g),
            target_carb_g: parseFloat(manualTargets.target_carb_g),
            target_fat_g: parseFloat(manualTargets.target_fat_g),
          }
        : computed!;
      await saveProfile({
        ...profileInput,
        dob: null,
        targets_source: override ? 'manual' : 'computed',
        ...targets,
      });
      showToast('Targets saved');
      router.replace('/');
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      {...formScrollProps}
    >
      <Stack.Screen options={{ headerRight: hasProfile ? () => <HomeButton /> : () => null }} />
      <Text style={styles.sub}>
        Your details are used only to estimate your calories and macros. They’re stored on this device and backed up to your account.
      </Text>

      <GroupHeader>Sex</GroupHeader>
      <Segmented options={SEXES} value={sex} onChange={setSex} />

      <GroupHeader>You</GroupHeader>
      <Card>
        <NumRow first label="Age" value={age} onChangeText={touch(setAge)} placeholder="30" />
        <NumRow label="Height" value={height} onChangeText={touch(setHeight)} placeholder="170" suffix="cm" />
        <NumRow label="Weight" value={weight} onChangeText={touch(setWeight)} placeholder="70" suffix="kg" />
      </Card>
      {weightFromTrend ? (
        <GroupFooter>Weight filled in from your current weight trend. Save to update your targets.</GroupFooter>
      ) : null}

      <GroupHeader>Activity level</GroupHeader>
      <View style={styles.chips}>
        {ACTIVITIES.map((o) => (
          <Chip key={o.value} label={o.label} on={activity === o.value} onPress={() => setActivity(o.value)} />
        ))}
      </View>

      <GroupHeader>Goal</GroupHeader>
      <Segmented options={GOALS} value={goal} onChange={setGoal} />

      <View style={styles.targetHeader}>
        <Text style={styles.targetHeaderText}>DAILY TARGETS</Text>
        <View style={styles.overrideToggle}>
          <Text style={styles.overrideLabel}>Customize</Text>
          <Switch
            value={override}
            onValueChange={toggleOverride}
            trackColor={{ false: colors.switchOff, true: colors.good }}
            thumbColor="#ffffff"
            ios_backgroundColor={colors.switchOff}
          />
        </View>
      </View>

      <Card>
        {!profileInput ? (
          <Row first>
            {/* Neutral until a field has been edited — no error before you've typed anything. */}
            <Text style={[styles.hint, !touched && styles.hintNeutral]}>
              {touched && formError ? formError : 'Fill in your age, height and weight to see targets.'}
            </Text>
          </Row>
        ) : override ? (
          TARGET_FIELDS.map(({ key, label, suffix, color }, i) => (
            <NumRow
              key={key}
              first={i === 0}
              label={label}
              labelColor={color}
              value={manualTargets[key]}
              onChangeText={(t) => setManualTargets((m) => ({ ...m, [key]: t }))}
              placeholder="0"
              suffix={suffix}
            />
          ))
        ) : (
          TARGET_FIELDS.map(({ key, label, suffix, color }, i) => {
            const hero = key === 'target_kcal';
            return (
              <Row key={key} first={i === 0} minHeight={hero ? 52 : 44}>
                <Text style={[styles.targetLabel, { color }]}>{label}</Text>
                <Text style={[styles.targetValue, hero && styles.targetHero]}>
                  {hero ? int(computed![key]) : computed![key]}{' '}
                  <Text style={styles.targetSuffix}>{suffix}</Text>
                </Text>
              </Row>
            );
          })
        )}
      </Card>
      {manualError ? <Text style={styles.errorText}>{manualError}</Text> : null}
      <GroupFooter>Use this as a starting point and adjust after you have real logged trends.</GroupFooter>

      <PrimaryButton
        title={saving ? 'Saving…' : 'Save Targets'}
        onPress={onSave}
        disabled={!canSave || saving}
        hint={!canSave && !saving ? 'Complete your details above to save.' : null}
        style={styles.save}
      />
    </ScrollView>
  );
}

function NumRow({
  label,
  labelColor,
  value,
  onChangeText,
  placeholder,
  suffix,
  first,
}: {
  label: string;
  labelColor?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  suffix?: string;
  first?: boolean;
}) {
  return (
    <Row first={first}>
      <Text style={[styles.fieldLabel, labelColor ? { color: labelColor, fontWeight: '600' } : null]}>
        {label}
      </Text>
      <View style={styles.fieldValue}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.leaf}
          keyboardType="numeric"
          inputMode="decimal"
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </Row>
  );
}

function firstFormError(p: {
  sex: Sex | null;
  ageNum: number;
  heightNum: number;
  weightNum: number;
  activity: ActivityLevel | null;
  goal: Goal | null;
}): string | null {
  if (!p.sex || !p.activity || !p.goal) return 'Choose sex, activity level, and goal.';
  if (!(p.ageNum >= 13 && p.ageNum <= 100)) return 'Enter an age between 13 and 100.';
  if (!(p.heightNum >= 100 && p.heightNum <= 230)) return 'Enter height in cm between 100 and 230.';
  if (!(p.weightNum >= 25 && p.weightNum <= 250)) return 'Enter weight in kg between 25 and 250.';
  return null;
}

function firstManualError(targets: Record<keyof Targets, string>): string | null {
  if (!(parseFloat(targets.target_kcal) > 0)) return 'Calories must be above 0.';
  for (const key of ['target_protein_g', 'target_carb_g', 'target_fat_g'] as const) {
    if (!(parseFloat(targets[key]) >= 0)) return 'Macro targets cannot be negative.';
  }
  return null;
}

function numStr(n: number | null): string {
  return n != null ? String(n) : '';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  sub: { ...type.subhead, color: colors.muted, lineHeight: 20, paddingHorizontal: 4, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { ...type.body, color: colors.ink, marginRight: 12 },
  fieldValue: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  input: { ...type.body, color: colors.ink, flex: 1, textAlign: 'right', paddingVertical: 0 },
  suffix: { ...type.body, color: colors.muted },
  targetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 7,
    marginLeft: 16,
    marginRight: 4,
  },
  targetHeaderText: { ...type.footnote, color: colors.muted, letterSpacing: 0.2 },
  overrideToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overrideLabel: { ...type.subhead, color: colors.muted },
  hint: { ...type.subhead, color: colors.saffron, lineHeight: 20, flex: 1 },
  hintNeutral: { color: colors.muted },
  targetLabel: { ...type.body, fontWeight: '600' },
  targetValue: { ...type.headline, color: colors.ink },
  targetHero: { ...heroNumber(22, '700') },
  targetSuffix: { ...type.subhead, color: colors.muted, fontWeight: '400', fontFamily: undefined },
  errorText: { ...type.footnote, color: colors.rose, marginTop: 8, marginLeft: 16 },
  save: { marginTop: 24 },
});
