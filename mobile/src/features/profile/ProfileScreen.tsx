import React, {useCallback, useEffect, useState} from 'react';
import {
  RefreshControl,
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
import type {GlyphName} from '../../components/Glyph';
import {
  CountUp,
  FadeSlideIn,
  PressableScale,
  Shimmer,
} from '../../components/motion';

type Props = {
  /** Seed from AppShell so the tab paints before the network round-trip. */
  initialBalanceCents?: number | null;
  initialRating?: number | null;
  initialDisplayName?: string | null;
  onWalletChange?: (
    balanceCents: number,
    rating: number,
    displayName?: string | null,
  ) => void;
};

export function ProfileScreen({
  initialBalanceCents = null,
  initialRating = null,
  initialDisplayName = null,
  onWalletChange,
}: Props): React.JSX.Element {
  const [profile, setProfile] = useState<EnsureProfileResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      onWalletChange?.(p.walletBalanceCents, p.rating, p.displayName);
    } catch (e) {
      setError(mapCallableError(e).message);
    } finally {
      setBusy(false);
    }
  }, [onWalletChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const name =
    profile?.displayName?.trim() ||
    initialDisplayName?.trim() ||
    email?.split('@')[0] ||
    profile?.firebaseUid.slice(0, 8) ||
    uid.slice(0, 8) ||
    'Player';

  const balanceCents = profile?.walletBalanceCents ?? initialBalanceCents;
  const rating = profile?.rating ?? initialRating;
  const status = profile?.status ?? null;
  const showSeed = !profile && (balanceCents != null || rating != null);
  const loadingStats = busy && !profile && !showSeed;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          tintColor={colors.textMuted}
          colors={[colors.cash]}
          progressBackgroundColor={colors.surface}
        />
      }>
      <Text style={styles.title}>Profile</Text>

      <FadeSlideIn delay={0} style={styles.hero}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Glyph name="user" size={36} color={colors.textPrimary} />
          </View>
        </View>
        <Text style={styles.name}>{name}</Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}
        {status ? (
          <View
            style={[
              styles.statusPill,
              {
                borderColor:
                  status === 'active' ? colors.cash : colors.streak,
              },
            ]}>
            <Text
              style={[
                styles.statusText,
                {color: status === 'active' ? colors.cash : colors.streak},
              ]}>
              {status.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </FadeSlideIn>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FadeSlideIn delay={80} style={styles.tiles}>
        <StatTile
          glyph="cash"
          tint={colors.cash}
          label="Wallet"
          loading={loadingStats}
          value={balanceCents}
          format={n => formatCentsDisplay(n)}
        />
        <StatTile
          glyph="trophy"
          tint={colors.prizeFill}
          label="Rating"
          loading={loadingStats}
          value={rating}
        />
      </FadeSlideIn>

      <FadeSlideIn delay={160} style={styles.footer}>
        <PressableScale
          style={styles.signOut}
          onPress={() => signOut(appAuth())}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </PressableScale>
        <Text style={styles.hint}>Pull down to refresh</Text>
      </FadeSlideIn>
    </ScrollView>
  );
}

function StatTile({
  glyph,
  tint,
  label,
  value,
  loading,
  format,
}: {
  glyph: GlyphName;
  tint: string;
  label: string;
  value: number | null;
  loading: boolean;
  format?: (n: number) => string;
}): React.JSX.Element {
  return (
    <View style={styles.tile}>
      <View style={styles.tileHead}>
        <Glyph name={glyph} size={13} color={tint} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      {loading ? (
        <Shimmer height={28} radius={8} style={styles.tileSkeleton} />
      ) : value == null ? (
        <Text style={styles.tileValue}>—</Text>
      ) : (
        <CountUp value={value} format={format} style={styles.tileValue} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {padding: 24, gap: 12},
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  hero: {alignItems: 'center', gap: 6, marginTop: 8},
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.cashDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {color: colors.textPrimary, fontSize: 22, fontWeight: '800'},
  email: {color: colors.textMuted, fontSize: 14},
  statusPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  statusText: {fontSize: 10, fontWeight: '800', letterSpacing: 1},
  error: {color: colors.fail, textAlign: 'center'},
  tiles: {flexDirection: 'row', gap: 12, marginTop: 8},
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  tileHead: {flexDirection: 'row', alignItems: 'center', gap: 6},
  tileLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tileValue: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tileSkeleton: {marginVertical: 3},
  footer: {alignItems: 'center', gap: 10, marginTop: 24},
  signOut: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutLabel: {color: colors.fail, fontWeight: '700'},
  hint: {color: colors.textTertiary, fontSize: 11},
});
