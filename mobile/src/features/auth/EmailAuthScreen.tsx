import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
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

type Props = {
  onSignedIn: () => void;
};

/**
 * Phase 4 auth: email/password only (DECISIONS.md A19).
 */
export function EmailAuthScreen({onSignedIn}: Props): React.JSX.Element {
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
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.sub}>Email / password (Phase 4)</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="email"
        placeholderTextColor="#6b7c8f"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="password"
        placeholderTextColor="#6b7c8f"
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? (
        <ActivityIndicator color="#9ec5ff" />
      ) : (
        <View style={styles.row}>
          <Pressable style={styles.button} onPress={() => run('signIn')}>
            <Text style={styles.buttonLabel}>Sign in</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => run('signUp')}>
            <Text style={styles.buttonLabel}>Create account</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1420',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    color: '#f4f7fb',
    fontSize: 28,
    fontWeight: '700',
  },
  sub: {
    color: '#9aa8b8',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2a3a4d',
    borderRadius: 8,
    color: '#f4f7fb',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#2f6fed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondary: {
    backgroundColor: '#243447',
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#ff8f8f',
  },
});
