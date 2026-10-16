/**
 * A brief confirmation pill ("Logged Dal makhani") shown after a save. `showToast` can be
 * called from anywhere — including right before navigating away — and <Toast /> (rendered
 * once in the root layout) shows it on top of whichever screen comes next.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, type } from './theme';

const useToastStore = create<{ message: string | null; seq: number }>(() => ({
  message: null,
  seq: 0,
}));

export function showToast(message: string): void {
  useToastStore.setState((s) => ({ message, seq: s.seq + 1 }));
}

export function Toast() {
  const { message, seq } = useToastStore();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) useToastStore.setState({ message: null });
    });
    return () => anim.stop();
  }, [seq, message, opacity]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      // Bottom of the screen, clear of the floating Log Food button and away from titles.
      style={[styles.wrap, { bottom: insets.bottom + 140, opacity }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>✓  {message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.fill,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    maxWidth: '90%',
  },
  text: { ...type.subhead, fontWeight: '600', color: colors.ink },
});
