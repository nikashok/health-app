import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Platform,
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
import { useKeyboardVisible } from './useKeyboardVisible';

/**
 * iOS UI kit. Small, composable primitives that give every screen the same
 * grouped-inset-list look: solid #1c1c1e cards on black, hairline separators inset
 * to the text edge, SF type, segmented controls, steppers, and capsule buttons.
 */

/** An inset card — the container for a grouped list section. No border, radius 16. */
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
export function GroupHeader({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.groupHeader, style]}>{String(children).toUpperCase()}</Text>;
}

/** Quiet explanatory footnote that sits below a Card. */
export function GroupFooter({ children }: { children: React.ReactNode }) {
  return <Text style={styles.groupFooter}>{children}</Text>;
}

/** The grey disclosure chevron at the trailing edge of a tappable row. */
export function Chevron({ style }: { style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.chevron, style]}>›</Text>;
}

/**
 * Card header line: a category label in its colour on the left ("Calories", "Weight")
 * and an optional muted detail on the right, with a chevron when it is tappable.
 */
export function CardHeader({
  label,
  color,
  detail,
  onPress,
}: {
  label: string;
  color: string;
  detail?: string;
  onPress?: () => void;
}) {
  const right = (
    <View style={styles.cardHeaderRight}>
      {detail ? <Text style={styles.cardHeaderDetail}>{detail}</Text> : null}
      {onPress ? <Chevron style={styles.cardHeaderChevron} /> : null}
    </View>
  );
  return (
    <View style={styles.cardHeader}>
      <Text style={[styles.cardHeaderLabel, { color }]}>{label}</Text>
      {onPress ? (
        <Pressable onPress={onPress} hitSlop={8}>
          {right}
        </Pressable>
      ) : (
        right
      )}
    </View>
  );
}

/**
 * A row inside a Card. The row is inset 16 from the card edge; every row after the
 * first draws a hairline across its content only, so the separator starts at the text
 * edge and the Card reads as one continuous grouped list.
 */
export function Row({
  children,
  onPress,
  first,
  style,
  contentStyle,
  minHeight = 44,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  minHeight?: number;
}) {
  const content = (
    <View style={[styles.rowContent, { minHeight }, !first && styles.rowDivider, contentStyle]}>
      {children}
    </View>
  );
  if (!onPress) return <View style={[styles.row, style]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [styles.row, style, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Full-width capsule button — the primary action on a screen. `hint` says what is
 * missing; it shows under the button only while the button is disabled.
 */
export function PrimaryButton({
  title,
  onPress,
  disabled,
  hint,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityHint={disabled && hint ? hint : undefined}
        style={({ pressed }) => [
          styles.primary,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={styles.primaryText}>{title}</Text>
      </Pressable>
      {disabled && hint ? <Text style={styles.buttonHint}>{hint}</Text> : null}
    </View>
  );
}

/** Blue-tint capsule — a secondary action. `hint` behaves as on PrimaryButton. */
export function TintButton({
  title,
  onPress,
  disabled,
  hint,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          styles.tint,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={styles.tintText}>{title}</Text>
      </Pressable>
      {disabled && hint ? <Text style={styles.buttonHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * ScrollView props for any screen with text inputs: taps on chips and buttons work on
 * the first try while the keyboard is open, dragging the content dismisses it, and iOS
 * scrolls the focused field above the keyboard.
 */
export const formScrollProps = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
  automaticallyAdjustKeyboardInsets: true,
} as const;

/** Centred red text button for a destructive action (Delete …). */
export function DestructiveButton({
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
      style={({ pressed }) => [styles.destructive, pressed && styles.pressed, style]}
    >
      <Text style={styles.destructiveText}>{title}</Text>
    </Pressable>
  );
}

/**
 * A floating capsule centred over a 120 px fade at the bottom of the screen. `primary`
 * is the blue call to action (Home); `secondary` is the dark card style (Add Food).
 */
export function BottomAction({
  title,
  onPress,
  variant = 'primary',
  insetBottom = 0,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  insetBottom?: number;
}) {
  const primary = variant === 'primary';
  // Hidden while typing: it would otherwise float on top of the keyboard over the content.
  const keyboardOpen = useKeyboardVisible();
  if (keyboardOpen) return null;
  return (
    <View style={[styles.bottomWrap, { height: 120 + insetBottom }]} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.bottomBtn,
          primary ? styles.bottomPrimary : styles.bottomSecondary,
          pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
        ]}
      >
        <Text style={[styles.bottomPlus, !primary && styles.bottomTextSecondary]}>+</Text>
        <Text style={[styles.bottomText, !primary && styles.bottomTextSecondary]}>{title}</Text>
      </Pressable>
    </View>
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
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * iOS stepper with an editable value. The ± buttons nudge by `step`; the value is
 * also directly editable so decimal quantities (e.g. 1.5 rotis) stay possible.
 *
 * A `step` above 1 snaps to the nearest multiple, so 10 g jumps land on 10/20/30 rather
 * than trailing whatever was typed (1 → 11 → 21). `step` of 1 adds and subtracts plainly,
 * leaving decimal quantities alone. `unit` renders muted after the value ("180 g").
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  unit,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  unit?: string;
}) {
  const current = parseFloat(value);
  const set = (n: number) => {
    const clamped = Math.max(min, Math.round(n * 100) / 100);
    onChange(String(clamped));
  };
  const nudge = (dir: 1 | -1) => {
    const from = Number.isFinite(current) ? current : 0;
    if (step <= 1) return set(from + dir * step);
    const grid = dir === 1 ? Math.floor(from / step) : Math.ceil(from / step);
    set((grid + dir) * step);
  };
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperValueWrap}>
        <TextInput
          style={styles.stepperValue}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          inputMode="decimal"
          selectTextOnFocus
          selectionColor={colors.leaf}
          accessibilityLabel={unit ? `Quantity in ${unit === 'g' ? 'grams' : unit}` : 'Quantity'}
        />
        {unit ? <Text style={styles.stepperUnit}>{unit}</Text> : null}
      </View>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => nudge(-1)}
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnOn]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Decrease quantity"
        >
          <Text style={styles.stepperSign}>−</Text>
        </Pressable>
        <View style={styles.stepperSep} />
        <Pressable
          onPress={() => nudge(1)}
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnOn]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Increase quantity"
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
  labelStyle,
  suffix,
  first,
  minHeight,
  children,
}: {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  suffix?: string;
  first?: boolean;
  minHeight?: number;
  children: React.ReactNode;
}) {
  return (
    <Row first={first} minHeight={minHeight}>
      <Text style={[styles.fieldLabel, labelStyle]}>{label}</Text>
      <View style={styles.fieldValue}>
        {children}
        {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
      </View>
    </Row>
  );
}

/** Thin hairline inside a card, between the hero block and its details. */
export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.hairline, style]} />;
}

export const text = StyleSheet.create({
  rowTitle: { ...type.body, color: colors.ink },
  rowTitleStrong: { ...type.headline, color: colors.ink },
  rowDetail: { ...type.subhead, color: colors.muted },
  value: { ...type.body, color: colors.muted },
  /** Muted unit after a hero number ("kcal"). */
  unit: { fontSize: 17, fontWeight: '600', color: colors.muted },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  groupHeader: {
    ...type.footnote,
    color: colors.muted,
    marginTop: 22,
    marginLeft: 16,
    marginBottom: 7,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  groupFooter: {
    ...type.footnote,
    color: colors.muted,
    marginTop: 7,
    marginHorizontal: 16,
    lineHeight: 18,
  },
  chevron: { color: colors.chevron, fontSize: 19, fontWeight: '600', marginLeft: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderLabel: { ...type.subhead, fontWeight: '600' },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardHeaderDetail: { ...type.subhead, color: colors.muted },
  cardHeaderChevron: { marginLeft: 0 },
  row: { paddingLeft: 16 },
  rowPressed: { backgroundColor: colors.fill },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingRight: 16,
  },
  rowDivider: {
    borderTopWidth: 0.5,
    borderTopColor: colors.separator,
  },
  primary: {
    backgroundColor: colors.leaf,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  primaryText: { ...type.headline, color: '#ffffff' },
  buttonHint: { ...type.footnote, color: colors.muted, textAlign: 'center', marginTop: 8 },
  tint: {
    backgroundColor: colors.mint,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tintText: { ...type.headline, color: colors.leaf },
  destructive: { height: 50, alignItems: 'center', justifyContent: 'center' },
  destructiveText: { ...type.body, color: colors.rose },
  bottomWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 38,
  },
  bottomBtn: {
    height: 50,
    paddingHorizontal: 28,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomPrimary: {
    backgroundColor: colors.leaf,
    shadowColor: colors.leaf,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  bottomSecondary: { backgroundColor: colors.surface, paddingHorizontal: 26 },
  bottomPlus: { fontSize: 22, fontWeight: '500', lineHeight: 24, color: '#ffffff' },
  bottomText: { ...type.headline, color: '#ffffff' },
  bottomTextSecondary: { color: colors.leaf },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 9,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.segmentOn },
  segmentText: { ...type.footnote, color: colors.ink, fontWeight: '500' },
  segmentTextOn: { fontWeight: '600' },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.leaf },
  chipText: { ...type.subhead, color: colors.ink },
  chipTextOn: { fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  stepperValue: {
    ...type.headline,
    color: colors.ink,
    width: 56, // fixed: a web <input> otherwise takes its default ~20ch width
    textAlign: 'right',
    paddingVertical: 4,
  },
  stepperUnit: { ...type.body, color: colors.muted },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    backgroundColor: colors.fill,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  stepperBtn: { width: 46, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepperBtnOn: { backgroundColor: colors.lineStrong },
  stepperSign: { fontSize: 22, color: colors.ink, lineHeight: 26 },
  stepperSep: { width: 0.5, height: 18, backgroundColor: colors.lineStrong },
  fieldLabel: { ...type.body, color: colors.ink },
  fieldValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldSuffix: { ...type.body, color: colors.muted },
  hairline: { height: 0.5, backgroundColor: colors.separator },
});
