import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  ScorePayload,
  SubmitScoreResponse,
  Uuid,
} from '@project-x/shared';
import {STREAK_FALLBACK_TARGETS} from '@project-x/shared';
import {newIdempotencyKey} from '../../lib/idempotency';
import {continueStreak} from '../../services/callables';
import {formatCentsDisplay} from '../../lib/formatMoney';
import {mapCallableError} from '../../lib/callableErrors';
import {colors, radii} from '../../theme';
import {FaceoffAvatars} from '../../components/FaceoffAvatars';
import {Glyph} from '../../components/Glyph';
import type {MatchRunParams} from './MatchRunScreen';

type Props = {
  submit: SubmitScoreResponse;
  payload: ScorePayload;
  onDone: () => void;
  onContinueStreak?: (params: MatchRunParams) => void;
};

/** Live submit outcome in lobby chrome. Payouts are server cents only. */
export function MatchResultScreen({
  submit,
  payload,
  onDone,
  onContinueStreak,
}: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const canContinue =
    submit.outcome === 'streak_leg_cleared' && Boolean(onContinueStreak);

  const onContinue = async () => {
    if (submit.outcome !== 'streak_leg_cleared' || !onContinueStreak) {
      return;
    }
    setBusy(true);
    setStatus('Starting next leg…');
    try {
      const next = await continueStreak({
        streakId: submit.streakId,
        idempotencyKey: newIdempotencyKey() as Uuid,
      });
      onContinueStreak({
        matchId: next.pveMatchId,
        seat: 1,
        stakeCents: next.stakeCents,
        scoreDeadlineAt: next.scoreDeadlineAt,
        opponentPostedScore: null,
        clientRunId: newIdempotencyKey() as Uuid,
        serverNowEpochMs: next.serverNowEpochMs,
        gameStartEpochMs: next.gameStartEpochMs,
        gameEndEpochMs: next.gameEndEpochMs,
        streakId: next.streakId,
        currentLeg: next.currentLeg,
        targetScore: next.targetScore,
        targetScores: next.targetScores,
        expiresAt: next.expiresAt,
      });
    } catch (e) {
      setStatus(mapCallableError(e).message);
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.topActions}>
        <Text style={styles.topLink}>Match analytics</Text>
        <Text style={styles.topLink}>Match {submit.matchId.slice(0, 8)}</Text>
      </View>
      {renderOutcome(submit, payload.score)}
      <ScorePair claimed={payload.score} submit={submit} />
      <Text style={styles.id}>Match {submit.matchId}</Text>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {busy ? <ActivityIndicator color={colors.cash} /> : null}
      {canContinue ? (
        <Pressable
          style={styles.cta}
          onPress={() => {
            onContinue();
          }}
          disabled={busy}>
          <Text style={styles.ctaLabel}>
            Continue leg {submit.nextLeg}
          </Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.done} onPress={onDone} disabled={busy}>
        <Text style={styles.doneLabel}>Done</Text>
      </Pressable>
    </View>
  );
}

function renderOutcome(
  submit: SubmitScoreResponse,
  claimedScore: number,
): React.JSX.Element {
  if (submit.outcome === 'settled' && submit.result === 'draw') {
    return (
      <>
        <Text style={styles.heroTitle}>It's a tie!</Text>
        <Text style={styles.heroAmt}>
          {formatCentsDisplay(submit.payoutCents)}
        </Text>
        <FaceoffAvatars
          left={{name: 'You', score: String(submit.acceptedScore)}}
          right={{name: 'Opponent', score: String(submit.acceptedScore)}}
        />
      </>
    );
  }
  if (submit.outcome === 'settled') {
    const title =
      submit.result === 'win'
        ? 'You won'
        : submit.result === 'loss'
          ? 'You lost'
          : 'Settled';
    return (
      <>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroAmt}>
          {formatCentsDisplay(submit.payoutCents)}
        </Text>
        <Text style={styles.sub}>Score {submit.acceptedScore}</Text>
      </>
    );
  }
  if (submit.outcome === 'streak_resolved' && submit.streakStatus === 'lost') {
    return (
      <>
        <Text style={styles.heroTitle}>Results</Text>
        <Text style={styles.heroAmt}>{submit.acceptedScore}</Text>
        <View style={styles.ended}>
          <Glyph name="flame" size={16} color={colors.fail} />
          <Text style={styles.endedText}>Streak ended</Text>
        </View>
        <StreakLegs
          highlightFail
          failLeg={submit.currentLeg}
          targets={submit.targetScores}
        />
      </>
    );
  }
  if (submit.outcome === 'streak_resolved') {
    return (
      <>
        <Text style={styles.heroTitle}>Streak complete</Text>
        <Text style={styles.heroAmt}>
          {formatCentsDisplay(submit.payoutCents)}
        </Text>
        <Text style={styles.sub}>Score {submit.acceptedScore}</Text>
        {submit.targetScores ? (
          <StreakLegs
            targets={submit.targetScores}
            clearedThrough={3}
          />
        ) : null}
      </>
    );
  }
  if (submit.outcome === 'streak_leg_cleared') {
    return (
      <>
        <Text style={styles.heroTitle}>Leg cleared</Text>
        <Text style={styles.heroAmt}>{submit.acceptedScore}</Text>
        <Text style={styles.sub}>
          Next target {submit.nextTargetScore} · leg {submit.nextLeg}/
          {submit.legsTotal}
        </Text>
        <StreakLegs
          targets={submit.targetScores}
          clearedThrough={submit.legCleared}
        />
      </>
    );
  }
  if (
    submit.outcome === 'scored_open' ||
    submit.outcome === 'scored_waiting_opponent'
  ) {
    return (
      <>
        <Text style={styles.heroTitle}>Waiting for opponent</Text>
        <Text style={styles.heroAmt}>{submit.acceptedScore}</Text>
        <Text style={styles.sub}>
          {submit.outcome === 'scored_open'
            ? 'Refund if no one joins'
            : 'Opponent is playing'}
        </Text>
        <FaceoffAvatars
          left={{name: 'You', score: String(submit.acceptedScore)}}
          right={{name: 'Opponent', searching: true}}
        />
      </>
    );
  }
  if (submit.outcome === 'ignored_deadline') {
    return (
      <>
        <Text style={styles.heroTitle}>Too late</Text>
        <Text style={styles.sub}>The server clock owns this score.</Text>
      </>
    );
  }
  return (
    <>
      <Text style={styles.heroTitle}>Results</Text>
      <Text style={styles.heroAmt}>{claimedScore}</Text>
    </>
  );
}

function ScorePair({
  claimed,
  submit,
}: {
  claimed: number;
  submit: SubmitScoreResponse;
}): React.JSX.Element {
  const accepted =
    submit.outcome === 'ignored_deadline' ? null : submit.acceptedScore;
  return (
    <View style={styles.pair}>
      <View style={styles.pairCol}>
        <Text style={styles.pairLabel}>Claimed</Text>
        <Text style={styles.pairValue}>{claimed}</Text>
      </View>
      <View style={styles.pairCol}>
        <Text style={styles.pairLabel}>Accepted</Text>
        <Text style={styles.pairValue}>
          {accepted == null ? '—' : String(accepted)}
        </Text>
      </View>
    </View>
  );
}

function StreakLegs({
  targets,
  highlightFail,
  failLeg,
  clearedThrough,
}: {
  targets?: [number, number, number];
  highlightFail?: boolean;
  failLeg?: 1 | 2 | 3;
  clearedThrough?: 1 | 2 | 3;
}): React.JSX.Element {
  const failedAt = failLeg ?? (highlightFail ? 1 : undefined);
  return (
    <View style={styles.ladder}>
      {([1, 2, 3] as const).map(n => {
        const failed = highlightFail && failedAt === n;
        const cleared = clearedThrough != null && n <= clearedThrough;
        const score = String(
          (targets ?? STREAK_FALLBACK_TARGETS)[n - 1],
        );
        return (
          <View
            key={n}
            style={[styles.leg, failed ? styles.legFail : null]}>
            <Text style={styles.legGame}>Game {n}</Text>
            <View style={styles.legMid}>
              <Text style={styles.legMuted}>Score to beat</Text>
              <Text style={styles.legScore}>{score}</Text>
            </View>
            {failed ? (
              <View style={styles.failIcon}>
                <Glyph name="close" size={14} color={colors.textPrimary} />
              </View>
            ) : cleared ? (
              <Glyph name="check" size={18} color={colors.cash} />
            ) : (
              <Glyph name="lock" size={18} color={colors.textTertiary} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    paddingTop: 16,
    gap: 10,
  },
  topActions: {
    width: '100%',
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topLink: {color: colors.textMuted, fontSize: 12, fontWeight: '600'},
  heroTitle: {color: colors.textPrimary, fontSize: 28, fontWeight: '800'},
  heroAmt: {color: colors.textPrimary, fontSize: 48, fontWeight: '800'},
  sub: {color: colors.textMuted, fontSize: 14},
  id: {color: colors.textTertiary, fontSize: 11, paddingHorizontal: 16},
  pair: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 4,
  },
  pairCol: {alignItems: 'center', minWidth: 88},
  pairLabel: {color: colors.textMuted, fontSize: 12, fontWeight: '600'},
  pairValue: {color: colors.textPrimary, fontSize: 22, fontWeight: '800'},
  status: {color: colors.streak, textAlign: 'center', paddingHorizontal: 24},
  ended: {flexDirection: 'row', alignItems: 'center', gap: 6},
  endedText: {color: colors.fail, fontWeight: '700'},
  cta: {
    backgroundColor: colors.cta,
    borderRadius: radii.pill,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  ctaLabel: {color: colors.textPrimary, fontWeight: '800', fontSize: 16},
  done: {
    paddingVertical: 10,
  },
  doneLabel: {color: colors.textMuted, fontWeight: '700'},
  ladder: {width: '100%', paddingHorizontal: 16, gap: 10, marginTop: 8},
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legFail: {borderColor: colors.fail},
  legGame: {color: colors.textMuted, width: 64, fontWeight: '700'},
  legMid: {flex: 1},
  legMuted: {color: colors.textMuted, fontSize: 12},
  legScore: {color: colors.textPrimary, fontSize: 18, fontWeight: '800'},
  failIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.fail,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
