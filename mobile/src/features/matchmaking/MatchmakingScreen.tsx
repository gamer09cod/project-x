import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
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
  onFailedBack: () => void;
  onJoined: (
    params: MatchRunParams,
    walletBalanceCents: Cents,
    streakRun?: StreakRunResponse,
  ) => void;
};

type Phase = 'searching' | 'starting' | 'failed';

export function MatchmakingScreen({
  mode,
  stakeCents,
  idempotencyKey,
  boostPreview,
  boostId,
  onFailedBack,
  onJoined,
}: Props): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>(
    mode === 'streak' ? 'starting' : 'searching',
  );
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(idempotencyKey);
  const inFlight = useRef(false);

  const run = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setError(null);
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

  const status =
    phase === 'failed'
      ? error ?? 'Request failed'
      : mode === 'streak'
        ? 'Starting streak…'
        : 'Finding a player…';

  return (
    <View style={styles.root}>
      <View style={styles.hero} />
      <View style={styles.body}>
        <FaceoffAvatars
          left={{name: 'You'}}
          right={
            mode === 'streak'
              ? {name: 'PvE', locked: true}
              : {name: 'Opponent', searching: phase !== 'failed'}
          }
        />
        <Text style={styles.status}>{status}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>
            {mode === 'streak' ? 'Streak' : '1v1'} ·{' '}
            {formatCentsDisplay(stakeCents)}
          </Text>
        </View>
        {boostPreview && mode === 'pvp_1v1' ? (
          <View style={styles.boostPill}>
            <Text style={styles.boostPillText}>BOOST SELECTED</Text>
          </View>
        ) : null}
        {phase !== 'failed' ? (
          <ActivityIndicator color={colors.cash} style={styles.spin} />
        ) : null}
        <Text style={styles.note}>Entry is charged when a match starts.</Text>
        {phase === 'failed' ? (
          <View style={styles.actions}>
            <Pressable style={styles.retry} onPress={() => { run(); }}>
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
            <Pressable onPress={onFailedBack}>
              <Text style={styles.back}>Back to Play</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  hero: {height: 140, backgroundColor: '#1E3A5F'},
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
  },
  status: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
  },
  meta: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  metaText: {color: colors.textMuted, fontWeight: '600'},
  boostPill: {
    borderWidth: 1,
    borderColor: colors.cash,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  boostPillText: {color: colors.cash, fontWeight: '800', fontSize: 12},
  spin: {marginTop: 8},
  note: {color: colors.textTertiary, fontSize: 12, marginTop: 8},
  actions: {alignItems: 'center', gap: 12, marginTop: 16},
  retry: {
    backgroundColor: colors.cta,
    borderRadius: radii.pill,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  retryLabel: {color: colors.textPrimary, fontWeight: '800', fontSize: 16},
  back: {color: colors.textMuted, fontWeight: '600'},
});
