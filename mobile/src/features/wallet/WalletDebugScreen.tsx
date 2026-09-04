import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {signOut} from '@react-native-firebase/auth';
import type {Cents, GetWalletResponse, Uuid} from '@project-x/shared';
import {MOCK_DEPOSIT_MAX_CENTS} from '@project-x/shared';
import {newIdempotencyKey} from '../../lib/idempotency';
import {ensureProfile, getWallet, mockDeposit} from '../../services/callables';
import {appAuth} from '../../services/firebase';

type Props = {
  onOpenUnity: () => void;
};

/**
 * Phase 4 debug wallet. Displays server balance/rating only — no client money math.
 */
export function WalletDebugScreen({onOpenUnity}: Props): React.JSX.Element {
  const [wallet, setWallet] = useState<GetWalletResponse | null>(null);
  const [depositCents, setDepositCents] = useState('1000');
  const [status, setStatus] = useState('Loading profile…');
  const [busy, setBusy] = useState(false);
  const [depositKey, setDepositKey] = useState(() => newIdempotencyKey());

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const profile = await ensureProfile({});
      setStatus(
        `Profile ok · ${profile.displayName ?? profile.firebaseUid.slice(0, 8)}`,
      );
      const w = await getWallet();
      setWallet(w);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDeposit = async () => {
    const cents = Number(depositCents);
    if (!Number.isInteger(cents) || cents <= 0) {
      setStatus('Deposit must be a positive integer (cents)');
      return;
    }
    setBusy(true);
    try {
      const res = await mockDeposit({
        cents: cents as Cents,
        idempotencyKey: depositKey as Uuid,
      });
      setWallet({
        userId: res.userId,
        balanceCents: res.balanceCents,
        rating: wallet?.rating ?? 1000,
      });
      setStatus(`Credited ${res.creditedCents}¢ · balance ${res.balanceCents}¢`);
      // New key for the next distinct deposit tap.
      setDepositKey(newIdempotencyKey());
      const w = await getWallet();
      setWallet(w);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Deposit failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    await signOut(appAuth());
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Wallet</Text>
      <Text style={styles.sub}>{status}</Text>
      {wallet ? (
        <View style={styles.card}>
          <Text style={styles.metric}>
            Balance: {wallet.balanceCents}¢
          </Text>
          <Text style={styles.metric}>Rating: {wallet.rating}</Text>
          <Text style={styles.mono}>{wallet.userId}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>
        Mock deposit (cents, max {MOCK_DEPOSIT_MAX_CENTS})
      </Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={depositCents}
        onChangeText={setDepositCents}
        placeholderTextColor="#6b7c8f"
      />
      <Text style={styles.mono}>idempotencyKey: {depositKey}</Text>

      {busy ? <ActivityIndicator color="#9ec5ff" /> : null}

      <View style={styles.row}>
        <Pressable style={styles.button} onPress={refresh} disabled={busy}>
          <Text style={styles.buttonLabel}>Refresh</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onDeposit} disabled={busy}>
          <Text style={styles.buttonLabel}>Deposit</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable
          style={[styles.button, styles.secondary]}
          onPress={onOpenUnity}>
          <Text style={styles.buttonLabel}>Unity ping</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondary]}
          onPress={onSignOut}>
          <Text style={styles.buttonLabel}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1420',
    padding: 24,
    gap: 10,
  },
  title: {
    color: '#f4f7fb',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 24,
  },
  sub: {
    color: '#9aa8b8',
  },
  card: {
    backgroundColor: '#152233',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  metric: {
    color: '#f4f7fb',
    fontSize: 18,
    fontWeight: '600',
  },
  label: {
    color: '#c5d0dc',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2a3a4d',
    borderRadius: 8,
    color: '#f4f7fb',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mono: {
    color: '#7f93a8',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
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
});
