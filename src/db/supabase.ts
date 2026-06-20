import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// supabase-js needs a WHATWG URL implementation on React Native.
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

/**
 * The Supabase client — the app's source of truth for USER data (profile, diary
 * entries, custom foods). The bundled SQLite DB stays on-device as a fast, offline,
 * read-only cache for FOOD SEARCH only; nothing the user creates lives there.
 *
 * The anon key is safe to ship in the client: every table is guarded by Row-Level
 * Security so a logged-in user can only read/write their own rows, and the food
 * reference tables are read-only to everyone. Override via EXPO_PUBLIC_* env vars.
 */
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://evxwakgxbfwymvmyowic.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eHdha2d4YmZ3eW12bXlvd2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzMyODYsImV4cCI6MjA5NzU0OTI4Nn0.EMt2PK2Hvr1UL75xzBN0aSYnFOqxySlVhev84PWUxU4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // localStorage on web (the default), AsyncStorage on native — so sessions
    // survive restarts and the user stays logged in.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * The signed-in user's id, or throws. Reads the locally-cached session (no network),
 * so it's cheap to call on every user-data query. The auth gate guarantees a session
 * exists before any app screen runs.
 */
export async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Not signed in');
  return id;
}
