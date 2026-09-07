import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {signOut} from '@react-native-firebase/auth';
import type {EnsureProfileResponse} from '@project-x/shared';
import {colors, radii} from '../../theme';
import {formatCentsDisplay} from '../../lib/formatMoney';
import {mapCallableError} from '../../lib/callableErrors';
import {ensureProfile, getWallet} from '../../services/callables';
import {appAuth} from '../../services/firebase';
import {Glyph} from '../../components/Glyph';

type Props = {
  onWalletChange?: (balanceCents: number, rating: number) => void;
};

export function ProfileScreen({onWalletChange}: Props): React.JSX.Element {
  const [profile, setProfile] = useState<EnsureProfileResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = appAuth().currentUser?.email ?? null;

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProfile({});
      const w = await getWallet();
      setProfile({
        ...p,
        rating: w.rating,
        walletBalanceCents: w.balanceCents,
      });
      onWalletChange?.(w.balanceCents, w.rating);
    } catch (e) {
      setError(mapCallableError(e).message);
    } finally {
      setBusy(false);
    }
  }, [onWalletChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const name =
    profile?.displayName?.trim() ||
    email?.split('@')[0] ||
    profile?.firebaseUid.slice(0, 8) ||
    'Player';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.avatar}>
        <Glyph name="user" size={36} color={colors.textPrimary} />
      </View>
      <Text style={styles.name}>{name}</Text>
      {email ? <Text style={styles.email}>{email}</Text> : null}

      {busy && !profile ? <ActivityIndicator color={colors.cash} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {profile ? (
        <View style={styles.card}>
          <Row label="Wallet" value={formatCentsDisplay(profile.walletBalanceCents)} />
          <Row label="Rating" value={String(profile.rating)} />
          <Row label="Status" value={profile.status} />
        </View>
      ) : null}

      <Pressable style={styles.refresh} onPress={refresh} disabled={busy}>
        <Text style={styles.refreshLabel}>{busy ? 'Refreshing…' : 'Refresh'}</Text>
      </Pressable>
      <Pressable style={styles.signOut} onPress={() => signOut(appAuth())}>
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({label, value}: {label: string; value: string}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {padding: 24, alignItems: 'center', gap: 10},
  title: {
    alignSelf: 'flex-start',
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  name: {color: colors.textPrimary, fontSize: 22, fontWeight: '800'},
  email: {color: colors.textMuted, fontSize: 14},
  error: {color: colors.fail, textAlign: 'center'},
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {color: colors.textMuted, fontSize: 14},
  rowValue: {color: colors.textPrimary, fontSize: 16, fontWeight: '700'},
  refresh: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  refreshLabel: {color: colors.cash, fontWeight: '700'},
  signOut: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.pill,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  signOutLabel: {color: colors.textPrimary, fontWeight: '700'},
});
