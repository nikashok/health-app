import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/db/supabase';
import { Card, GroupFooter, PrimaryButton, Row, Segmented } from './components';
import { colors, type } from './theme';

type Mode = 'signin' | 'signup';
const MODES: { value: Mode; label: string }[] = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
];

/**
 * Login / signup gate. Rendered by the root layout whenever there's no Supabase
 * session; a successful sign-in fires onAuthStateChange, which swaps this for the app.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // Success → onAuthStateChange in the root layout takes over.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // If the project requires email confirmation, there's no session yet.
        if (!data.session) {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Nutrition Tracker</Text>
          <Text style={styles.sub}>
            Your diary syncs across your devices and is private to your account.
          </Text>

          <Segmented options={MODES} value={mode} onChange={setMode} style={styles.modes} />

          <Card>
            <Row first>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                textContentType="emailAddress"
              />
            </Row>
            <Row>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="6+ characters"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="password"
              />
            </Row>
          </Card>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <GroupFooter>{notice}</GroupFooter> : null}

          <PrimaryButton
            title={busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            onPress={onSubmit}
            disabled={!canSubmit}
            style={styles.submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: 16 },
  title: { ...type.largeTitle, color: colors.ink, textAlign: 'center' },
  sub: { ...type.subhead, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 24, lineHeight: 20 },
  modes: { marginBottom: 18 },
  label: { ...type.body, color: colors.ink, marginRight: 12, minWidth: 84 },
  input: { ...type.body, color: colors.ink, flex: 1, textAlign: 'right', paddingVertical: 0 },
  error: { ...type.footnote, color: colors.rose, marginTop: 10, marginHorizontal: 16 },
  submit: { marginTop: 22 },
});
