import React, {useState} from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from '@react-native-firebase/auth';
import {appAuth} from '../../services/firebase';
import {colors, radii} from '../../theme';
import {Glyph} from '../../components/Glyph';
import {ScreenSafe} from '../../components/ScreenSafe';
import {FadeSlideIn, PressableScale, Shake} from '../../components/motion';

type Props = {
  onSignedIn: () => void;
};

type Step = 'landing' | 'signIn' | 'signUp';

const HERO = require('./assets/login-hero.png');

const ACCENT = '#3B82F6';
const SUPPORT_URL = 'mailto:support@project-x.app';
const TERMS_URL = 'https://project-x.app/terms';
const PRIVACY_URL = 'https://project-x.app/privacy';

function authMessage(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as {code: unknown}).code)
      : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'That email already has an account.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Try again.';
    default:
      return err instanceof Error ? err.message : 'Could not sign in.';
  }
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

/**
 * Splash + email/password. Google and phone from the mock stay off — A19.
 */
export function EmailAuthScreen({onSignedIn}: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'signIn' | 'signUp') => {
    setBusy(true);
    setError(null);
    try {
      const a = appAuth();
      if (mode === 'signUp') {
        await createUserWithEmailAndPassword(a, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(a, email.trim(), password);
      }
      onSignedIn();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onLanding = (next: Step) => {
    setError(null);
    setStep(next);
  };

  return (
    <ImageBackground
      source={HERO}
      style={styles.root}
      resizeMode="cover">
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <View style={styles.scrimTop} pointerEvents="none" />
      <View style={styles.scrimBottom} pointerEvents="none" />

      <ScreenSafe style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.logo}>
            PROJECT-<Text style={styles.logoX}>X</Text>
          </Text>
          <View style={styles.supportHit}>
            <PressableScale
              onPress={() => openUrl(SUPPORT_URL)}
              accessibilityRole="button"
              accessibilityLabel="Support">
              <View style={styles.support}>
                <Glyph name="headset" size={13} color={colors.textPrimary} />
                <Text style={styles.supportLabel}>Support</Text>
              </View>
            </PressableScale>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {step === 'landing' ? (
            <FadeSlideIn delay={40} distance={16} style={styles.hero}>
              <Text style={styles.heroLine}>STAKE N</Text>
              <Text style={[styles.heroLine, styles.heroEarn]}>EARN</Text>
              <Text style={styles.tagline}>Play. Compete. Win.</Text>
            </FadeSlideIn>
          ) : (
            <View style={styles.heroSpacer} />
          )}

          <FadeSlideIn delay={120} distance={18} style={styles.sheet}>
            {step === 'landing' ? (
              <LandingActions
                busy={busy}
                onEmail={() => onLanding('signIn')}
                onCreate={() => onLanding('signUp')}
              />
            ) : (
              <EmailForm
                mode={step}
                email={email}
                password={password}
                busy={busy}
                error={error}
                onEmail={setEmail}
                onPassword={setPassword}
                onBack={() => onLanding('landing')}
                onSubmit={() => run(step)}
                onSwitchMode={() =>
                  onLanding(step === 'signIn' ? 'signUp' : 'signIn')
                }
              />
            )}
            <Legal />
          </FadeSlideIn>
        </KeyboardAvoidingView>
      </ScreenSafe>
    </ImageBackground>
  );
}

function LandingActions({
  busy,
  onEmail,
  onCreate,
}: {
  busy: boolean;
  onEmail: () => void;
  onCreate: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.actions}>
      <PressableScale
        style={styles.primaryBtn}
        onPress={onEmail}
        disabled={busy}
        accessibilityRole="button">
        <Glyph name="mail" size={18} color="#111111" />
        <Text style={styles.primaryLabel}>Continue with Email</Text>
      </PressableScale>
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.orLine} />
      </View>
      <PressableScale
        style={styles.secondaryBtn}
        onPress={onCreate}
        disabled={busy}
        accessibilityRole="button">
        <Glyph name="userPlus" size={18} color={colors.textPrimary} />
        <Text style={styles.secondaryLabel}>Create account</Text>
      </PressableScale>
    </View>
  );
}

function EmailForm({
  mode,
  email,
  password,
  busy,
  error,
  onEmail,
  onPassword,
  onBack,
  onSubmit,
  onSwitchMode,
}: {
  mode: 'signIn' | 'signUp';
  email: string;
  password: string;
  busy: boolean;
  error: string | null;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onSwitchMode: () => void;
}): React.JSX.Element {
  const submitLabel = mode === 'signUp' ? 'Create account' : 'Sign in';
  const switchLabel =
    mode === 'signUp' ? 'Have an account? Sign in' : 'Need an account? Create one';

  return (
    <View style={styles.form}>
      <PressableScale
        style={styles.back}
        onPress={onBack}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Back">
        <Glyph name="back" size={22} color={colors.textPrimary} />
        <Text style={styles.backLabel}>Back</Text>
      </PressableScale>
      <Text style={styles.formTitle}>{submitLabel}</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor="rgba(255,255,255,0.45)"
        value={email}
        onChangeText={onEmail}
        editable={!busy}
        returnKeyType="next"
      />
      <TextInput
        style={styles.input}
        autoComplete="password"
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="rgba(255,255,255,0.45)"
        value={password}
        onChangeText={onPassword}
        editable={!busy}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      {error ? (
        <Shake trigger={error}>
          <Text style={styles.error}>{error}</Text>
        </Shake>
      ) : null}
      {busy ? (
        <ActivityIndicator color={ACCENT} style={styles.spinner} />
      ) : (
        <PressableScale
          style={styles.primaryBtn}
          onPress={onSubmit}
          accessibilityRole="button">
          <Text style={styles.primaryLabel}>{submitLabel}</Text>
        </PressableScale>
      )}
      <PressableScale onPress={onSwitchMode} disabled={busy}>
        <Text style={styles.switchLabel}>{switchLabel}</Text>
      </PressableScale>
    </View>
  );
}

function Legal(): React.JSX.Element {
  return (
    <Text style={styles.legal}>
      By continuing, you agree to our{' '}
      <Text style={styles.legalLink} onPress={() => openUrl(TERMS_URL)}>
        Terms of Service
      </Text>
      {' and '}
      <Text style={styles.legalLink} onPress={() => openUrl(PRIVACY_URL)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 380,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  header: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportHit: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  logo: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 1.4,
  },
  logoX: {
    color: ACCENT,
  },
  support: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  supportLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    justifyContent: 'space-between',
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 36,
  },
  heroSpacer: {
    flex: 1,
  },
  heroLine: {
    color: colors.textPrimary,
    fontSize: 52,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 0.5,
    lineHeight: 56,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 8,
  },
  heroEarn: {
    color: ACCENT,
  },
  tagline: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  sheet: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 16,
  },
  actions: {
    gap: 14,
  },
  primaryBtn: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryLabel: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1.5,
    borderColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondaryLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  orText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  form: {
    gap: 12,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: 4,
  },
  backLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  formTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  input: {
    height: 52,
    borderRadius: radii.card,
    backgroundColor: 'rgba(20,20,22,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: {
    color: colors.fail,
    fontSize: 13,
    fontWeight: '600',
  },
  spinner: {
    height: 56,
  },
  switchLabel: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 4,
  },
  legal: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  legalLink: {
    color: ACCENT,
    fontWeight: '600',
  },
});
