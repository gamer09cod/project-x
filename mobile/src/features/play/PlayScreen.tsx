import React, {useEffect, useState} from 'react';
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {Cents, StreakSnapshot} from '@project-x/shared';
import {STREAK_FALLBACK_TARGETS} from '@project-x/shared';
import {colors, radii} from '../../theme';
import {WagerStepper} from '../../components/WagerStepper';
import {BoostInfoModal} from '../../components/BoostInfoModal';
import {Glyph} from '../../components/Glyph';
import {formatCentsDisplay} from '../../lib/formatMoney';
import {stakeAt} from '../../lib/stakes';

export type PlayMode = 'free' | 'pvp_1v1' | 'blitz' | 'streak';

const GAME_BANNER = require('./assets/game-banner.jpg');

type Props = {
  boostActive: boolean;
  activeStreak: StreakSnapshot | null;
  previewTargets: [number, number, number];
  streakLoadError: string | null;
  streakBusy: boolean;
  onPlay: (args: {mode: 'pvp_1v1' | 'streak'; stakeCents: Cents}) => void;
  onResumeStreak: () => void;
  onContinueStreak: () => void;
  onAbandonStreak: () => void;
};

export function PlayScreen({
  boostActive,
  activeStreak,
  previewTargets,
  streakLoadError,
  streakBusy,
  onPlay,
  onResumeStreak,
  onContinueStreak,
  onAbandonStreak,
}: Props): React.JSX.Element {
  const [mode, setMode] = useState<PlayMode>('pvp_1v1');
  const [stakeIndex, setStakeIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [helper, setHelper] = useState<string | null>(null);

  const stakeCents = stakeAt(stakeIndex);
  const canPlay = mode === 'pvp_1v1' || mode === 'streak';

  useEffect(() => {
    if (activeStreak?.streakStatus === 'active' && mode !== 'streak') {
      setMode('streak');
    }
  }, [activeStreak?.streakId, activeStreak?.streakStatus, mode]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={GAME_BANNER}
          style={styles.hero}
          resizeMode="cover">
          <View style={styles.heroNav}>
            <Pressable style={styles.heroBtn} onPress={() => setInfoOpen(true)}>
              <Glyph name="help" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
        </ImageBackground>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modes}>
          <ModeChip
            label="Free"
            active={mode === 'free'}
            onPress={() => {
              setMode('free');
              setHelper('Free play is not in v1.');
            }}>
            <Glyph
              name="coin"
              size={14}
              color={mode === 'free' ? colors.textPrimary : colors.textMuted}
            />
          </ModeChip>
          <ModeChip
            label="1v1"
            active={mode === 'pvp_1v1'}
            glow="green"
            onPress={() => {
              setMode('pvp_1v1');
              setHelper(null);
            }}>
            <Glyph
              name="cash"
              size={14}
              color={mode === 'pvp_1v1' ? colors.cash : colors.textMuted}
            />
          </ModeChip>
          <ModeChip
            label="Blitz"
            active={mode === 'blitz'}
            onPress={() => {
              setMode('blitz');
              setHelper('Blitz is not in v1.');
            }}>
            <Glyph
              name="zap"
              size={14}
              color={mode === 'blitz' ? colors.streak : colors.textMuted}
            />
          </ModeChip>
          <ModeChip
            label="Streak"
            active={mode === 'streak'}
            glow="orange"
            onPress={() => {
              setMode('streak');
              setHelper(null);
            }}>
            <Glyph
              name="flame"
              size={14}
              color={mode === 'streak' ? colors.streak : colors.textMuted}
            />
          </ModeChip>
        </ScrollView>

        {helper ? <Text style={styles.helper}>{helper}</Text> : null}
        {streakLoadError ? (
          <Text style={styles.helper}>{streakLoadError}</Text>
        ) : null}
        {activeStreak ? (
          <ActiveStreakCard
            streak={activeStreak}
            busy={streakBusy}
            onResume={onResumeStreak}
            onContinue={onContinueStreak}
            onAbandon={onAbandonStreak}
          />
        ) : null}

        {mode === 'streak' ? (
          <StreakPreview
            stakeCents={stakeCents}
            streak={activeStreak}
            previewTargets={previewTargets}
          />
        ) : (
          <PayoutPreview
            boostActive={boostActive && mode === 'pvp_1v1'}
            stakeCents={stakeCents}
          />
        )}
      </ScrollView>

      <View style={styles.bottom}>
        <WagerStepper index={stakeIndex} onChangeIndex={setStakeIndex} />
        <Pressable
          style={[styles.play, !canPlay || Boolean(activeStreak) ? styles.playOff : null]}
          disabled={!canPlay || Boolean(activeStreak)}
          onPress={() => {
            if (mode === 'pvp_1v1' || mode === 'streak') {
              onPlay({mode, stakeCents});
            }
          }}>
          {mode === 'streak' ? (
            <Text style={styles.playLabel}>Start Streak</Text>
          ) : (
            <View style={styles.playInner}>
              <Glyph name="play" size={16} color={colors.textPrimary} />
              <Text style={styles.playLabel}>Play</Text>
            </View>
          )}
        </Pressable>
      </View>
      <BoostInfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </View>
  );
}

function ModeChip({
  label,
  active,
  glow,
  onPress,
  children,
}: {
  label: string;
  active: boolean;
  glow?: 'green' | 'orange';
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const border =
    active && glow === 'green'
      ? colors.cash
      : active && glow === 'orange'
        ? colors.textPrimary
        : colors.border;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {borderColor: border},
        active && glow === 'green' ? styles.chipGreen : null,
      ]}>
      {children}
      <Text style={[styles.chipLabel, active ? styles.chipOn : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) {
    return 'Expired';
  }
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${mins}m left`;
}

function ActiveStreakCard({
  streak,
  busy,
  onResume,
  onContinue,
  onAbandon,
}: {
  streak: StreakSnapshot;
  busy: boolean;
  onResume: () => void;
  onContinue: () => void;
  onAbandon: () => void;
}): React.JSX.Element {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const expiredCopy =
    streak.streakStatus === 'lost' && streak.failReason === 'expired';
  return (
    <View style={styles.activeCard}>
      <Text style={styles.activeTitle}>
        {expiredCopy ? 'Streak expired' : 'Active streak'}
      </Text>
      <Text style={styles.previewNote}>
        {formatCentsDisplay(streak.stakeCents)} · 2.5× on full clear ·{' '}
        {formatRemaining(streak.expiresAt)}
      </Text>
      {([1, 2, 3] as const).map(n => {
        const target =
          streak.targetScores[n - 1] ??
          STREAK_FALLBACK_TARGETS[n - 1];
        const score = streak.legScores[n - 1];
        const current = streak.currentLeg === n;
        return (
          <Text key={n} style={styles.activeLine}>
            Game {n}: beat {target}
            {score != null ? ` · scored ${score}` : current ? ' · now' : ''}
          </Text>
        );
      })}
      {streak.streakStatus === 'active' && streak.canResumeRun ? (
        <Pressable style={styles.streakCta} disabled={busy} onPress={onResume}>
          <Text style={styles.playLabel}>Resume game {streak.currentLeg}</Text>
        </Pressable>
      ) : null}
      {streak.streakStatus === 'active' && streak.canContinue ? (
        <Pressable style={styles.streakCta} disabled={busy} onPress={onContinue}>
          <Text style={styles.playLabel}>Play game {streak.currentLeg}</Text>
        </Pressable>
      ) : null}
      {streak.streakStatus === 'active' ? (
        <Pressable disabled={busy} onPress={onAbandon}>
          <Text style={styles.abandon}>Quit streak (no refund)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PayoutPreview({
  boostActive,
  stakeCents,
}: {
  boostActive: boolean;
  stakeCents: number;
}): React.JSX.Element {
  return (
    <View style={styles.payout}>
      <Text style={styles.winLabel}>ENTRY</Text>
      <View style={styles.payoutRow}>
        <Text style={styles.heroAmt}>{formatCentsDisplay(stakeCents)}</Text>
      </View>
      {boostActive ? (
        <View style={styles.boostPill}>
          <Text style={styles.boostPillText}>BOOST SELECTED</Text>
        </View>
      ) : null}
      <Text style={styles.previewNote}>
        Payout is set by the server after the match
      </Text>
    </View>
  );
}

function StreakPreview({
  stakeCents,
  streak,
  previewTargets,
}: {
  stakeCents: number;
  streak: StreakSnapshot | null;
  previewTargets: [number, number, number];
}): React.JSX.Element {
  const displayStake = streak?.stakeCents ?? stakeCents;
  const ladder = streak?.targetScores ?? previewTargets;
  return (
    <View style={styles.payout}>
      <Text style={styles.winLabel}>ENTRY</Text>
      <Text style={styles.heroAmt}>{formatCentsDisplay(displayStake)}</Text>
      <Text style={styles.previewNote}>
        One wager · 3 games · 2.5× total return if you beat every target
      </Text>
      <Text style={styles.previewNote}>
        Finish all 3 within 24 hours or the wager is lost. No refund.
      </Text>
      <Text style={styles.previewNote}>
        {streak
          ? 'Targets locked for this streak'
          : 'Targets shown are the current ladder and lock when you start'}
      </Text>
      {streak ? (
        <Text style={styles.previewNote}>
          {formatRemaining(streak.expiresAt)} · game {streak.currentLeg}/3
        </Text>
      ) : null}
      <View style={styles.ladder}>
        {([1, 2, 3] as const).map(n => {
          const target = ladder[n - 1];
          const score = streak?.legScores[n - 1];
          const current = streak?.currentLeg === n;
          const passed = score != null && target != null && score >= target;
          return (
            <View key={n} style={styles.leg}>
              {n < 3 ? <View style={styles.connector} /> : null}
              <View style={styles.legCard}>
                <Text style={styles.legGame}>Game {n}</Text>
                <View style={styles.legMid}>
                  <Text style={styles.legMuted}>
                    {score != null ? `Scored ${score} · beat` : 'Score to beat'}
                  </Text>
                  <Text style={styles.legScore}>{String(target)}</Text>
                </View>
                {passed ? (
                  <Glyph name="check" size={18} color={colors.cash} />
                ) : current ? (
                  <Glyph name="flame" size={18} color={colors.streak} />
                ) : (
                  <Glyph name="lock" size={18} color={colors.textTertiary} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  scroll: {paddingBottom: 16},
  hero: {
    height: 220,
    backgroundColor: '#0A1220',
    overflow: 'hidden',
  },
  heroNav: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  heroBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modes: {paddingHorizontal: 16, paddingVertical: 14, gap: 8},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    marginRight: 8,
  },
  chipGreen: {
    shadowColor: colors.cash,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  chipLabel: {color: colors.textMuted, fontWeight: '700'},
  chipOn: {color: colors.textPrimary},
  helper: {
    color: colors.streak,
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 13,
  },
  payout: {alignItems: 'center', paddingHorizontal: 16, gap: 6, paddingTop: 8},
  winLabel: {
    color: colors.textMuted,
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  payoutRow: {flexDirection: 'row', alignItems: 'center', gap: 16},
  heroAmt: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: '800',
  },
  boostPill: {
    borderWidth: 1,
    borderColor: colors.cash,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  boostPillText: {color: colors.cash, fontWeight: '800', fontSize: 12},
  previewNote: {color: colors.textTertiary, fontSize: 11, marginTop: 4},
  ladder: {width: '100%', marginTop: 16, gap: 10},
  leg: {position: 'relative'},
  connector: {
    position: 'absolute',
    left: 18,
    top: 48,
    width: 2,
    height: 22,
    backgroundColor: colors.border,
    zIndex: 0,
  },
  legCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 14,
    gap: 12,
  },
  legGame: {color: colors.textMuted, width: 64, fontWeight: '700'},
  legMid: {flex: 1},
  legMuted: {color: colors.textMuted, fontSize: 12},
  legScore: {color: colors.textPrimary, fontSize: 20, fontWeight: '800'},
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  play: {
    flex: 1,
    backgroundColor: colors.cta,
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOff: {opacity: 0.4},
  playInner: {flexDirection: 'row', alignItems: 'center', gap: 8},
  playLabel: {color: colors.textPrimary, fontSize: 18, fontWeight: '800'},
  activeCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.streak,
    gap: 8,
  },
  activeTitle: {color: colors.textPrimary, fontWeight: '800', fontSize: 16},
  activeLine: {color: colors.textMuted, fontSize: 13},
  streakCta: {
    backgroundColor: colors.cta,
    borderRadius: radii.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  abandon: {
    color: colors.fail,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
