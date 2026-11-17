/**
 * Sign in — the front door.
 *
 * This is the first thing anyone BENi is shared with ever sees. The brief for
 * it (BENI-60) was that it should feel like opening the door to your own
 * house, not like filling in a form on a vendor's site.
 *
 * Two layouts from the same parts:
 *
 *   Wide (laptop, ≥ 880px): a navy panel on the left carries the mark, the
 *   line the whole product is built on, and three plain sentences about what
 *   BENi does. The form sits on the right over the dusk street. This is the
 *   composition people recognise from products they trust — the panel says
 *   "this is somebody's", the form says "come in".
 *
 *   Narrow (phone): the panel would eat the screen, so it collapses to the
 *   mark and the tagline above the form, over the same backdrop.
 *
 * The card greets you by time of day. It is a small thing, and it is the
 * first proof that the app knows what time it is at your house.
 */
import Button from '@/components/Button';
import InfoPopup from '@/components/InfoPopup';
import { SingleLineInput } from '@/components/Inputs';
import AuthBackdrop from '@/components/auth/AuthBackdrop';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { timeOfDayGreeting } from '@/utils/homeBriefing';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { ComponentProps, useState } from 'react';
import { fonts, fontSize, radius, shadows, spacing } from '@/theme/tokens';
import {
  Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
} from 'react-native';

const SPLIT_BREAKPOINT = 880;

export default function LoginScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= SPLIT_BREAKPOINT;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [popupVisible, setPopupVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      setPopupVisible(true);
      return;
    }
    router.replace('/(tabs)/dashboard');
  };

  const form = (
    <View style={[styles.card, shadows.lg, { backgroundColor: colors.surface }]}>
      <Text style={[styles.eyebrow, { color: colors.gold }]}>{timeOfDayGreeting()}.</Text>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Welcome back</Text>

      <SingleLineInput
        placeholderText="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <SingleLineInput
        placeholderText="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        title={busy ? 'Signing in…' : 'Sign in'}
        onPress={handleLogin}
        variant="primary"
        fullWidth
        disabled={busy}
        style={{ marginBottom: spacing.sm }}
      />
      <Button
        title="Create an account"
        onPress={() => router.push('/(auth)/register')}
        variant="secondary"
        fullWidth
      />
    </View>
  );

  return (
    <View style={[styles.fill, wide && styles.split]}>
      {wide && (
        <View style={[styles.brandPanel, { backgroundColor: colors.headerBg }]}>
          <Image
            source={require('@/assets/images/beni-logo-cream.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={[styles.brandLine, { color: colors.headerText }]}>
            Own your home,{'\n'}not just the keys.
          </Text>
          <View style={styles.proofs}>
            <Proof icon="description" text="Reads your inspection report, page by page." />
            <Proof icon="event-repeat" text="Builds a plan around the seasons, not a to-do list." />
            <Proof icon="payments" text="Cost ranges from a local database, not a guess." />
          </View>
          <Text style={[styles.brandFoot, { color: colors.headerTextMuted }]}>
            Made in Calgary
          </Text>
        </View>
      )}

      <AuthBackdrop>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} hitSlop={10}>
              <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>

            {!wide && (
              <>
                <Image
                  source={require('@/assets/images/beni-logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={[styles.tagline, { color: colors.gold }]}>
                  Own your home, not just the keys.
                </Text>
              </>
            )}

            {form}

            <Text style={[styles.footnote, { color: colors.textMuted }]}>
              Turn your inspection report into a maintenance plan you'll actually use.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </AuthBackdrop>

      <InfoPopup
        visible={popupVisible}
        message={error}
        type="error"
        title="Login Failed"
        onClose={() => setPopupVisible(false)}
        showConfirm={false}
        cancelText="Close"
        autoDismiss={5000}
      />
    </View>
  );
}

function Proof({ icon, text }: { icon: ComponentProps<typeof MaterialIcons>['name']; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.proof}>
      <View style={[styles.proofIcon, { backgroundColor: colors.headerActiveBg }]}>
        <MaterialIcons name={icon} size={18} color={colors.headerAccent} />
      </View>
      <Text style={[styles.proofText, { color: colors.headerTextMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flexDirection: 'row' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  themeToggle: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    padding: spacing.sm,
  },
  themeToggleIcon: { fontSize: 20 },

  // ── Brand panel (wide only) ───────────────────────────────────────────────
  brandPanel: {
    flex: 1,
    maxWidth: 520,
    justifyContent: 'center',
    paddingHorizontal: 56,
    paddingVertical: 48,
  },
  brandLogo: {
    width: 96,
    height: 96,
    marginBottom: spacing.xl,
  },
  brandLine: {
    fontFamily: fonts.heading,
    fontSize: 40,
    lineHeight: 48,
    marginBottom: 36,
  },
  proofs: {
    gap: spacing.lg,
  },
  proof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  proofIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofText: {
    flex: 1,
    fontSize: fontSize.lg,
    lineHeight: 22,
  },
  brandFoot: {
    marginTop: 48,
    fontSize: fontSize.sm,
    letterSpacing: 0.6,
  },

  // ── Form side ─────────────────────────────────────────────────────────────
  logo: {
    width: 88,
    height: 88,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontFamily: fonts.voice,
    fontSize: fontSize.lg,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.xl + 4,
  },
  eyebrow: {
    fontFamily: fonts.voice,
    fontSize: fontSize.md,
    marginBottom: 2,
  },
  heading: {
    fontFamily: fonts.heading,
    fontSize: fontSize.h1,
    marginBottom: spacing.lg,
  },
  footnote: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xl,
    maxWidth: 320,
    lineHeight: 18,
  },
});
