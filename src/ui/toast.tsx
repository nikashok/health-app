/**
 * A brief pill ("Logged Dal makhani") shown after an action. `showToast` can be called
 * from anywhere — including right before navigating away — and <Toast /> (rendered once
 * in the root layout) shows it on top of whichever screen comes next.
 *
 * A toast can carry one action (e.g. "Undo"): it then stays up longer and is tappable.
 * `tone: 'error'` is for failures the user should know about ("Couldn’t save").
 */
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, type } from './theme';

export type ToastTone = 'success' | 'error';
export interface ToastAction {
  label: string;
  onPress: () => void;
}
interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction;
  durationMs?: number;
}
interface ToastState {
  message: string | null;
  tone: ToastTone;
  action: ToastAction | null;
  durationMs: number;
  seq: number;
}

const DEFAULT_MS = 1600;
const ACTION_MS = 5000;

const useToastStore = create<ToastState>(() => ({
  message: null,
  tone: 'success',
  action: null,
  durationMs: DEFAULT_MS,
  seq: 0,
}));

export function showToast(message: string, opts: ToastOptions = {}): void {
  useToastStore.setState((s) => ({
    message,
    tone: opts.tone ?? 'success',
    action: opts.action ?? null,
    durationMs: opts.durationMs ?? (opts.action ? ACTION_MS : DEFAULT_MS),
    seq: s.seq + 1,
  }));
}

/** Report a failed save/delete: logs the cause and shows an error toast. */
export function showError(e: unknown, message = 'Couldn’t save — try again'): void {
  console.warn('[action failed]', e);
  showToast(message, { tone: 'error', durationMs: 3200 });
}

function hide() {
  useToastStore.setState({ message: null, action: null });
}

export function Toast() {
  const { message, tone, action, durationMs, seq } = useToastStore();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(durationMs),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) hide();
    });
    return () => anim.stop();
  }, [seq, message, durationMs, opacity]);

  if (!message) return null;
  const error = tone === 'error';
  return (
    <Animated.View
      // Without an action the pill must never swallow taps meant for the screen below.
      pointerEvents={action ? 'box-none' : 'none'}
      // Bottom of the screen, clear of the floating buttons and the tab bar.
      style={[styles.wrap, { bottom: insets.bottom + 150, opacity }]}
      accessibilityLiveRegion="polite"
      accessibilityRole={error ? 'alert' : undefined}
    >
      <Text style={[styles.text, error && styles.errorText]} numberOfLines={2}>
        {error ? '!  ' : '✓  '}
        {message}
      </Text>
      {action ? (
        <Pressable
          onPress={() => {
            hide();
            action.onPress();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.fill,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 44,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    maxWidth: '92%',
  },
  text: { ...type.subhead, fontWeight: '600', color: colors.ink, flexShrink: 1, paddingVertical: 10, paddingRight: 8 },
  errorText: { color: colors.rose },
  action: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.mint },
  actionPressed: { opacity: 0.7 },
  actionText: { ...type.subhead, fontWeight: '700', color: colors.leaf },
});
