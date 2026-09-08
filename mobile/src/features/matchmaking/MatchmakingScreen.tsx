import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {
  Cents,
  JoinMatchResponse,
  StartStreakResponse,
  StreakRunResponse,
  Uuid,
} from '@project-x/shared';
import {GAME_ID_BASKETBALL_V1} from '@project-x/shared';
import {colors, radii} from '../../theme';
import {FaceoffAvatars} from '../../components/FaceoffAvatars';
import {Glyph} from '../../components/Glyph';
import {
  FadeSlideIn,
  LoadingDots,
  PressableScale,
  Pulse,
  Shake,
} from '../../components/motion';
import {formatCentsDisplay} from '../../lib/formatMoney';
import {mapCallableError} from '../../lib/callableErrors';
import {joinMatch, startStreak} from '../../services/callables';
import type {MatchRunParams} from '../match/MatchRunScreen';
import {newIdempotencyKey} from '../../lib/idempotency';

type Props = {
  mode: 'pvp_1v1' | 'streak';
  stakeCents: Cents;
  idempotencyKey: string;
  boostPreview: boolean;
  boostId: string | null;
  /** From ensureProfile — shown on the faceoff left slot. */
  displayName?: string | null;
  onFailedBack: () => void;
  onJoined: (
    params: MatchRunParams,
    walletBalanceCents: Cents,
    streakRun?: StreakRunResponse,
  ) => void;
};

type Phase = 'searching' | 'starting' | 'failed';

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MatchmakingScreen({
  mode,
  stakeCents,
  idempotencyKey,
  boostPreview,
  boostId,
  displayName,
  onFailedBack,
  onJoined,
}: Props): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>(
    mode === 'streak' ? 'starting' : 'searching',
  );
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const keyRef = useRef(idempotencyKey);
  const inFlight = useRef(false);
  const startedAt = useRef(Date.now());

  const run = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setError(null);
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase(mode === 'streak' ? 'starting' : 'searching');
    try {
      if (mode === 'streak') {
        const streak: StartStreakResponse = await startStreak({
          stakeCents,
          idempotencyKey: keyRef.current as Uuid,
        });
        onJoined(
          {
            matchId: streak.pveMatchId,
            seat: 1,
            stakeCents: streak.stakeCents,
            scoreDeadlineAt: streak.scoreDeadlineAt,
            opponentPostedScore: null,
            clientRunId: newIdempotencyKey() as Uuid,
            serverNowEpochMs: streak.serverNowEpochMs,
            gameStartEpochMs: streak.gameStartEpochMs,
            gameEndEpochMs: streak.gameEndEpochMs,
            streakId: streak.streakId,
            currentLeg: streak.currentLeg,
            targetScore: streak.targetScore,
            targetScores: streak.targetScores,
            expiresAt: streak.expiresAt,
          },
          streak.walletBalanceCents,
          streak,
        );
        return;
      }
      const join: JoinMatchResponse = await joinMatch({
        gameId: GAME_ID_BASKETBALL_V1,
        stakeCents,
        boostId: boostId as Uuid | null,
        idempotencyKey: keyRef.current as Uuid,
      });
      onJoined(
        {
          matchId: join.matchId,
          seat: join.seat,
          stakeCents: join.stakeCents,
          scoreDeadlineAt: join.scoreDeadlineAt,
          opponentPostedScore: join.opponentPostedScore,
          clientRunId: newIdempotencyKey() as Uuid,
          serverNowEpochMs: join.serverNowEpochMs,
          gameStartEpochMs: join.gameStartEpochMs,
          gameEndEpochMs: join.gameEndEpochMs,
        },
        join.walletBalanceCents,
      );
    } catch (e) {
      inFlight.current = false;
      const mapped = mapCallableError(e);
      setError(mapped.message);
      setPhase('failed');
    }
  }, [boostId, mode, onJoined, stakeCents]);

  useEffect(() => {
    run();
  }, [run]);

  // Display only. The real deadline is server-owned; this just makes a wait
  // feel bounded instead of hung.
  useEffect(() => {
    if (phase === 'failed') {
      return;
    }
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  const failed = phase === 'failed';
  const status = failed
    ? error ?? 'Request failed'
    : mode === 'streak'
      ? 'Starting streak'
      : 'Finding a player';

  const youLabel =
    displayName && displayName.trim().length > 0
      ? displayName.trim()
      : 'You';

  return (
    <View style={styles.root}>
      <Shake trigger={failed} style={styles.body}>
        <FadeSlideIn delay={0}>
          <FaceoffAvatars
            left={{name: youLabel}}
            right={
              mode === 'streak'
                ? {name: 'PvE', locked: true}
                : {name: 'Opponent', searching: !failed}
            }
            center={
              <Pulse active={!failed} max={1.08}>
                <View style={[styles.vs, failed ? styles.vsFailed : null]}>
                  <Text style={styles.vsText}>VS</Text>
                </View>
              </Pulse>
            }
          />
        </FadeSlideIn>

        <FadeSlideIn delay={80} style={styles.statusRow}>
          <Text style={[styles.status, failed ? styles.statusFailed : null]}>
            {status}
          </Text>
          {!failed ? <LoadingDots color={colors.textPrimary} /> : null}
        </FadeSlideIn>

        <FadeSlideIn delay={140} style={styles.pills}>
          <View style={styles.meta}>
            <Text style={styles.metaText}>
              {mode === 'streak' ? 'Streak' : '1v1'} ·{' '}
              {formatCentsDisplay(stakeCents)}
            </Text>
          </View>
          {boostPreview && mode === 'pvp_1v1' ? (
            <View style={styles.boostPill}>
              <Glyph name="zap" size={11} color={colors.cash} />
              <Text style={styles.boostPillText}>BOOST</Text>
            </View>
          ) : null}
        </FadeSlideIn>

        {!failed ? (
          <FadeSlideIn delay={200}>
            <Text style={styles.elapsed}>
              Searching · {formatElapsed(elapsed)}
            </Text>
          </FadeSlideIn>
        ) : null}

        <FadeSlideIn delay={260}>
          <Text style={styles.note}>Entry is charged when a match starts.</Text>
        </FadeSlideIn>

        {failed ? (
          <FadeSlideIn delay={60} style={styles.actions}>
            <PressableScale
              style={styles.retry}
              onPress={() => {
                run();
              }}>
              <Text style={styles.retryLabel}>Try again</Text>
            </PressableScale>
            <PressableScale onPress={onFailedBack} style={styles.backHit}>
              <Text style={styles.back}>Back to Play</Text>
            </PressableScale>
          </FadeSlideIn>
        ) : null}
      </Shake>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  vs: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsFailed: {borderColor: colors.fail},
  vsText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  status: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusFailed: {color: colors.fail, fontSize: 17},
  pills: {flexDirection: 'row', alignItems: 'center', gap: 8},
  meta: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  metaText: {color: colors.textMuted, fontWeight: '600'},
  boostPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.cash,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  boostPillText: {color: colors.cash, fontWeight: '800', fontSize: 11},
  elapsed: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  note: {color: colors.textTertiary, fontSize: 12},
  actions: {alignItems: 'center', gap: 8, marginTop: 12},
  retry: {
    backgroundColor: colors.cta,
    borderRadius: radii.pill,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  retryLabel: {color: colors.textPrimary, fontWeight: '800', fontSize: 16},
  backHit: {paddingVertical: 10, paddingHorizontal: 16},
  back: {color: colors.textMuted, fontWeight: '600'},
});
