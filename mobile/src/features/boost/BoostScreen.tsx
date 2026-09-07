import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type {PlayerBoost} from '@project-x/shared';
import {colors, radii} from '../../theme';
import {BoostInfoModal} from '../../components/BoostInfoModal';
import {Glyph} from '../../components/Glyph';
import {OFFER_FIXTURES} from '../../fixtures/boosts';
import {formatCentsDisplay} from '../../lib/formatMoney';
import {mapCallableError} from '../../lib/callableErrors';
import {ensureProfile, listBoosts} from '../../services/callables';

type Props = {
  activatedId: string | null;
  onActivate: (id: string) => void;
  onInventoryCount?: (count: number) => void;
};

function formatExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'Expired';
  }
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function percentLabel(bps: number): string {
  return `+${Math.floor(bps / 100)}% Prize Boost`;
}

function modeLabel(mode: string): string {
  return mode === 'pvp_1v1' ? '1v1' : mode;
}

export function BoostScreen({
  activatedId,
  onActivate,
  onInventoryCount,
}: Props): React.JSX.Element {
  const {width} = useWindowDimensions();
  const cardW = width - 32;
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boosts, setBoosts] = useState<PlayerBoost[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureProfile({});
      const res = await listBoosts();
      setBoosts(Array.isArray(res.boosts) ? res.boosts : []);
      onInventoryCount?.(res.boosts?.length ?? 0);
    } catch (e) {
      const mapped = mapCallableError(e);
      const hint =
        mapped.code === 'not-found' || /listBoosts/i.test(mapped.message)
          ? ' Deploy functions so listBoosts exists, then pull to refresh.'
          : '';
      setError(`${mapped.message}${hint}`);
      setBoosts([]);
      onInventoryCount?.(0);
    } finally {
      setLoading(false);
    }
  }, [onInventoryCount]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.section}>Special Offers</Text>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const next = Math.round(e.nativeEvent.contentOffset.x / cardW);
          setPage(next);
        }}>
        {OFFER_FIXTURES.map(offer => (
          <View key={offer.id} style={[styles.offer, {width: cardW}]}>
            <View style={styles.offerIcon}>
              <Glyph name="userPlus" size={18} color={colors.textPrimary} />
            </View>
            <Text style={styles.offerTitle}>{offer.title}</Text>
            <Text style={styles.offerBody} numberOfLines={2}>
              {offer.body}
            </Text>
            <View style={styles.offerFooter}>
              <Text style={styles.code}>
                Use code: {copied ? 'Copied' : offer.code}
              </Text>
              <View style={styles.offerActions}>
                <Pressable
                  style={styles.copyBtn}
                  onPress={() => setCopied(true)}>
                  <Glyph name="copy" size={12} color={colors.textPrimary} />
                  <Text style={styles.copyLabel}>Copy code</Text>
                </Pressable>
                <Pressable style={styles.shareBtn}>
                  <Glyph name="share" size={12} color={colors.textPrimary} />
                  <Text style={styles.shareLabel}>Share</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {OFFER_FIXTURES.map((offer, i) => (
          <View
            key={offer.id}
            style={[styles.dot, i === page ? styles.dotOn : null]}
          />
        ))}
      </View>

      <Text style={styles.section}>Your Boosts</Text>
      <Text style={styles.hint}>
        Activate one boost. It applies the next time you enter an eligible 1v1.
        The server decides whether it is still valid.
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.cash} style={styles.spin} />
      ) : null}
      {error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => load()}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && !error && boosts.length === 0 ? (
        <Text style={styles.emptyText}>
          No available prize boosts. Sign in, apply migrations, deploy
          functions, then open this tab again (a first-time welcome boost is
          issued automatically).
        </Text>
      ) : null}
      {boosts.map(boost => (
        <BoostCard
          key={boost.id}
          boost={boost}
          active={activatedId === boost.id}
          onInfo={() => setInfoOpen(true)}
          onActivate={() => onActivate(boost.id)}
        />
      ))}
      <BoostInfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </ScrollView>
  );
}

function BoostCard({
  boost,
  active,
  onInfo,
  onActivate,
}: {
  boost: PlayerBoost;
  active: boolean;
  onInfo: () => void;
  onActivate: () => void;
}): React.JSX.Element {
  return (
    <View style={[styles.card, active ? styles.cardActive : null]}>
      <View style={styles.cardTop}>
        <View style={styles.thumb}>
          <Text style={styles.thumbMark}>B</Text>
        </View>
        <View style={styles.cardMid}>
          <Text style={styles.boostTitle}>{percentLabel(boost.percentageBps)}</Text>
          <Text style={styles.gameName}>{boost.gameName}</Text>
          <View style={styles.meta}>
            <Glyph name="cash" size={12} color={colors.cash} />
            <Text style={styles.metaText}>
              {modeLabel(boost.gameMode)} · Max{' '}
              {boost.maxWagerCents == null
                ? '—'
                : formatCentsDisplay(boost.maxWagerCents)}
            </Text>
          </View>
        </View>
        <Pressable onPress={onInfo} hitSlop={8}>
          <Glyph name="help" size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.timer}>
          <Glyph name="clock" size={14} color={colors.textMuted} />
          <Text style={styles.timerText}>
            Expires in {formatExpiry(boost.expiresAt)}
          </Text>
        </View>
        <Pressable
          style={[styles.activate, active ? styles.activateOn : null]}
          onPress={onActivate}>
          <Text
            style={[
              styles.activateLabel,
              active ? styles.activateOnLabel : null,
            ]}>
            {active ? 'Active' : 'Activate'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {paddingHorizontal: 16, paddingBottom: 24, gap: 12},
  section: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  hint: {color: colors.textMuted, fontSize: 13, lineHeight: 18},
  spin: {marginVertical: 16},
  empty: {gap: 10},
  emptyText: {color: colors.textMuted, fontSize: 14},
  retry: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryLabel: {color: colors.textPrimary, fontWeight: '700'},
  offer: {
    borderRadius: radii.cardLg,
    padding: 16,
    backgroundColor: colors.cashDim,
    marginRight: 0,
    gap: 8,
    minHeight: 168,
  },
  offerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  offerBody: {color: '#9CB8A8', fontSize: 13, lineHeight: 18},
  offerFooter: {marginTop: 'auto', gap: 8},
  code: {color: colors.cash, fontWeight: '700', fontSize: 13},
  offerActions: {flexDirection: 'row', gap: 8, justifyContent: 'flex-end'},
  copyBtn: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyLabel: {color: colors.textPrimary, fontSize: 12, fontWeight: '600'},
  shareBtn: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: colors.cash,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  shareLabel: {color: colors.textPrimary, fontSize: 12, fontWeight: '700'},
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
  },
  dotOn: {backgroundColor: colors.textPrimary, width: 8},
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  cardActive: {borderColor: colors.cash},
  cardTop: {flexDirection: 'row', gap: 10, alignItems: 'flex-start'},
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radii.thumb,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbMark: {color: colors.textPrimary, fontWeight: '800', fontSize: 18},
  cardMid: {flex: 1, gap: 2},
  boostTitle: {color: colors.textPrimary, fontWeight: '800', fontSize: 16},
  gameName: {color: colors.textMuted, fontSize: 13},
  meta: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4},
  metaText: {color: colors.textMuted, fontSize: 12},
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timer: {flexDirection: 'row', alignItems: 'center', gap: 6},
  timerText: {color: colors.textPrimary, fontSize: 13, fontWeight: '600'},
  activate: {
    backgroundColor: colors.cash,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activateOn: {backgroundColor: colors.surfaceElevated},
  activateLabel: {color: colors.bg, fontWeight: '800', fontSize: 13},
  activateOnLabel: {color: colors.textPrimary},
});
