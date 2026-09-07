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
import {ensureProfile} from '../../services/callables';
import {appAuth} from '../../services/firebase';
import {Glyph} from '../../components/Glyph';

type Props = {
  /** Seed from AppShell so the tab paints before the network round-trip. */
  initialBalanceCents?: number | null;
  initialRating?: number | null;
  onWalletChange?: (balanceCents: number, rating: number) => void;
};

export function ProfileScreen({
  initialBalanceCents = null,
  initialRating = null,
  onWalletChange,
}: Props): React.JSX.Element {
  const [profile, setProfile] = useState<EnsureProfileResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = appAuth().currentUser?.email ?? null;
  const uid = appAuth().currentUser?.uid ?? '';

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Single callable: response already includes rating + walletBalanceCents.
      const p = await ensureProfile({});
      setProfile(p);
      onWalletChange?.(p.walletBalanceCents, p.rating);
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
    uid.slice(0, 8) ||
    'Player';

  const balanceCents = profile?.walletBalanceCents ?? initialBalanceCents;
  const rating = profile?.rating ?? initialRating;
  const status = profile?.status ?? null;
  const showSeed = !profile && (balanceCents != null || rating != null);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.avatar}>
        <Glyph name="user" size={36} color={colors.textPrimary} />
      </View>
      <Text style={styles.name}>{name}</Text>
      {email ? <Text style={styles.email}>{email}</Text> : null}

      {busy && !profile && !showSeed ? (
        <ActivityIndicator color={colors.cash} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {profile || showSeed ? (
        <View style={styles.card}>
          <Row
            label="Wallet"
            value={
              balanceCents != null ? formatCentsDisplay(balanceCents) : '—'
            }
          />
          <Row label="Rating" value={rating != null ? String(rating) : '—'} />
          {status ? <Row label="Status" value={status} /> : null}
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
    alignSelf: 'stretch',
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
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  refreshLabel: {color: colors.cash, fontWeight: '700'},
  signOut: {
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutLabel: {color: colors.fail, fontWeight: '700'},
});
