/**
 * Tiny per-device UI preferences (e.g. a dismissed nudge). Not user data: never synced,
 * and losing them only means a dismissed hint can show again. Every read/write is
 * wrapped, so a blocked or cleared storage never breaks a screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getPref(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`ux.${key}`);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`ux.${key}`, value);
  } catch {
    /* storage unavailable — the hint may reappear, which is harmless */
  }
}
