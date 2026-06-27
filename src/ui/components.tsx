import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radius, type } from './theme';

/**
 * iOS UI kit. Small, composable primitives that give every screen the same
 * grouped-inset-list look: white cards on a grouped background, hairline row
 * separators, SF type, segmented controls, steppers, and filled tint buttons.
 */

/** An inset white card — the container for a grouped list section. */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Uppercase section header that sits above a Card, inset like iOS Settings. */
export function GroupHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.groupHeader}>{String(children).toUpperCase()}</Text>;
}

/** Quiet explanatory footnote that sits below a Card. */
export function GroupFooter({ children }: { children: React.ReactNode }) {
  return <Text style={styles.groupFooter}>{children}</Text>;
}

/** The grey disclosure chevron at the trailing edge of a tappable row. */
export function Chevron() {
  return <Text style={styles.chevron}>›</Text>;
}

/**
 * A row inside a Card. Renders a leading hairline separator (inset) for every row
 * after the first so a Card reads as one continuous grouped list.
 */
export function Row({
  children,
  onPress,
  first,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[styles.row, !first && styles.rowDivider, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.fill }} style={pressableStyle}>
      {content}
    </Pressable>
  );
}

function pressableStyle({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> {
  return pressed ? { backgroundColor: colors.fill } : undefined;
}

/** Full-width filled tint (green) button — the primary action on a screen. */
export function PrimaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && styles.primaryPressed,
        style,
      ]}
    >
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

/** Bordered tint button — a secondary / outline action. */
export function TintButton({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tint, pressed && { opacity: 0.5 }, style]}
    >
      <Text style={styles.tintText}>{title}</Text>
    </Pressable>
  );
}

/** iOS segmented control. Good for 2–4 mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A selectable pill — for option sets too long or variable for a segmented control. */
export function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * iOS stepper with an editable value. The ± buttons nudge by `step`; the value is
 * also directly editable so decimal quantities (e.g. 1.5 rotis) stay possible.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
}) {
  const current = parseFloat(value);
  const set = (n: number) => {
    const clamped = Math.max(min, Math.round(n * 100) / 100);
    onChange(String(clamped));
  };
  return (
    <View style={styles.stepper}>
      <TextInput
        style={styles.stepperValue}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        inputMode="decimal"
        selectTextOnFocus
      />
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => set((Number.isFinite(current) ? current : 0) - step)}
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnOn]}
          hitSlop={6}
        >
          <Text style={styles.stepperSign}>–</Text>
        </Pressable>
        <View style={styles.stepperSep} />
        <Pressable
          onPress={() => set((Number.isFinite(current) ? current : 0) + step)}
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnOn]}
          hitSlop={6}
        >
          <Text style={styles.stepperSign}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A grouped form row with a label on the left and an editable value on the right. */
export function FieldRow({
  label,
  suffix,
  first,
  children,
}: {
  label: string;
  suffix?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Row first={first}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldValue}>
        {children}
        {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
      </View>
    </Row>
  );
}

export const text = StyleSheet.create({
  rowTitle: { ...type.body, color: colors.ink },
  rowTitleStrong: { ...type.headline, color: colors.ink },
  rowDetail: { ...type.subhead, color: colors.muted },
  value: { ...type.body, color: colors.muted },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  groupHeader: {
    ...type.footnote,
    color: colors.muted,
    marginTop: 24,
    marginLeft: 16,
    marginBottom: 7,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
    fontSize: 11,
  },
  groupFooter: {
    ...type.footnote,
    color: colors.muted,
    marginTop: 7,
    marginHorizontal: 16,
    lineHeight: 18,
  },
  chevron: { color: colors.faint, fontSize: 20, fontWeight: '500', marginLeft: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  primary: {
    backgroundColor: colors.leaf,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryPressed: { opacity: 0.85 },
  primaryDisabled: { backgroundColor: colors.disabled },
  primaryText: { ...type.headline, color: '#ffffff', fontSize: 17 },
  tint: {
    borderWidth: 1,
    borderColor: colors.leaf,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  tintText: { ...type.headline, color: colors.leafDark },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.fill,
    borderRadius: 9,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  segmentText: { ...type.subhead, color: colors.muted, fontWeight: '500' },
  segmentTextOn: { color: colors.ink, fontWeight: '700' },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.fillStrong,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.leaf, borderColor: colors.leaf },
  chipText: { ...type.subhead, color: colors.muted, fontWeight: '500' },
  chipTextOn: { color: '#ffffff', fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperValue: {
    ...type.body,
    color: colors.ink,
    fontWeight: '600',
    minWidth: 56,
    textAlign: 'right',
    paddingVertical: 4,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fillStrong,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  stepperBtn: { paddingHorizontal: 16, paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
  stepperBtnOn: { backgroundColor: colors.fill },
  stepperSign: { fontSize: 22, color: colors.leafDark, fontWeight: '500', lineHeight: 26 },
  stepperSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.lineStrong },
  fieldLabel: { ...type.body, color: colors.ink },
  fieldValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldSuffix: { ...type.body, color: colors.muted },
});
