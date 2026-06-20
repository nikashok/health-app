import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { initDatabase } from '@/db/database';
import { colors, type } from '@/ui/theme';

/**
 * Root layout. Blocks the UI until the database is copied, opened, and migrated
 * (M0) — every screen reads from it, so nothing should render before it's ready.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn’t start the database</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loading}>Preparing your food database…</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.leafDark,
        headerTitleStyle: { color: colors.ink, fontWeight: '600' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Targets', headerLargeTitle: true }} />
      <Stack.Screen name="diary" options={{ title: 'Diary', headerLargeTitle: true }} />
      <Stack.Screen name="log" options={{ title: 'Add Food' }} />
      <Stack.Screen name="log-entry" options={{ title: 'Add Food' }} />
      <Stack.Screen name="edit-entry" options={{ title: 'Edit Entry' }} />
      <Stack.Screen name="custom-food" options={{ title: 'Custom Food' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  loading: { ...type.subhead, marginTop: 12, color: colors.muted },
  errorTitle: { ...type.headline, color: colors.ink, marginBottom: 8 },
  errorBody: { ...type.subhead, color: colors.rose, textAlign: 'center' },
});
