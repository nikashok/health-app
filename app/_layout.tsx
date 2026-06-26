import type { Session } from '@supabase/supabase-js';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';

import { initDatabase } from '@/db/database';
import { supabase } from '@/db/supabase';
import { bootstrapSync, drainOutbox } from '@/db/sync';
import { AuthScreen } from '@/ui/AuthScreen';
import { colors, type } from '@/ui/theme';

/**
 * Root layout. Gates before the app renders:
 *  1. The on-device DB is copied, opened, and migrated — it's the source of truth now.
 *  2. There's a Supabase session — used to back up to / restore from the cloud.
 *  3. First-run restore (hydrate) completes, so the diary never flashes empty before
 *     the user's existing cloud data is pulled into local. Returning users skip this
 *     instantly (the hydrate marker makes it a no-op).
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [syncReady, setSyncReady] = useState(false);
  const bootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Once the DB is ready and a user is signed in, restore-if-needed then push anything
  // queued. Runs once per signed-in user; resets on sign-out.
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (!ready || !uid) {
      if (uid === null) {
        bootstrappedFor.current = null;
        setSyncReady(false);
      }
      return;
    }
    if (bootstrappedFor.current === uid) return;
    bootstrappedFor.current = uid;
    bootstrapSync().finally(() => setSyncReady(true));
  }, [ready, session]);

  // Drain the backup queue whenever the app comes to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') drainOutbox().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn’t start the database</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!ready || session === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loading}>Preparing your food database…</Text>
      </View>
    );
  }

  if (session === null) {
    return <AuthScreen />;
  }

  if (!syncReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loading}>Restoring your data…</Text>
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
      <Stack.Screen name="measurement" options={{ title: 'Weight & Waist' }} />
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
