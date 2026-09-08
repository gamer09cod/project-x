import React, {useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
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
import {
  CountUp,
  FadeSlideIn,
  PressableScale,
  Shake,
} from '../../components/motion';
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
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      {renderOutcome(submit, payload.score)}

      <FadeSlideIn delay={220}>
        <ScorePair claimed={payload.score} submit={submit} />
      </FadeSlideIn>

      <FadeSlideIn delay={260}>
        <Text style={styles.id}>Match {submit.matchId}</Text>
      </FadeSlideIn>

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {busy ? <ActivityIndicator color={colors.cash} /> : null}

      <FadeSlideIn delay={300} style={styles.footer}>
        {canContinue ? (
          <PressableScale
            style={styles.cta}
            onPress={() => {
              onContinue();
            }}
            disabled={busy}>
            <Text style={styles.ctaLabel}>Continue leg {submit.nextLeg}</Text>
          </PressableScale>
        ) : null}
        <PressableScale style={styles.done} onPress={onDone} disabled={busy}>
          <Text style={styles.doneLabel}>Done</Text>
        </PressableScale>
      </FadeSlideIn>
    </ScrollView>
  );
}

/**
 * Shared hero layout so every outcome gets the same rhythm and the tone colour
 * is applied in exactly one place.
 */
function ResultHero({
  tone,
  badge,
  title,
  amount,
  sub,
  children,
}: {
  tone: string;
  badge: string | null;
  title: string;
  amount: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      {badge ? (
        <FadeSlideIn delay={0}>
          <View style={[styles.badge, {borderColor: tone}]}>
            <Text style={[styles.badgeText, {color: tone}]}>{badge}</Text>
          </View>
        </FadeSlideIn>
      ) : null}
      <FadeSlideIn delay={40}>
        <Text style={styles.heroTitle}>{title}</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={90} scaleFrom={0.86}>
        {amount}
      </FadeSlideIn>
      {sub ? <FadeSlideIn delay={150}>{sub}</FadeSlideIn> : null}
      {children ? (
        <FadeSlideIn delay={190} style={styles.heroExtra}>
          {children}
        </FadeSlideIn>
      ) : null}
    </>
  );
}

function Money({
  cents,
  tone,
}: {
  cents: number;
  tone: string;
}): React.JSX.Element {
  return (
    <CountUp
      value={cents}
      format={n => formatCentsDisplay(n)}
      style={[styles.heroAmt, {color: tone}]}
    />
  );
}

function Points({
  score,
  tone,
}: {
  score: number;
  tone: string;
}): React.JSX.Element {
  return <CountUp value={score} style={[styles.heroAmt, {color: tone}]} />;
}

function renderOutcome(
  submit: SubmitScoreResponse,
  claimedScore: number,
): React.JSX.Element {
  if (submit.outcome === 'settled' && submit.result === 'draw') {
    return (
      <ResultHero
        tone={colors.prizeFill}
        badge="TIE"
        title="It's a tie!"
        amount={<Money cents={submit.payoutCents} tone={colors.prizeFill} />}>
        <FaceoffAvatars
          left={{name: 'You', score: String(submit.acceptedScore)}}
          right={{name: 'Opponent', score: String(submit.acceptedScore)}}
        />
      </ResultHero>
    );
  }

  if (submit.outcome === 'settled') {
    const win = submit.result === 'win';
    const loss = submit.result === 'loss';
    const tone = win ? colors.cash : loss ? colors.fail : colors.textPrimary;
    return (
      <ResultHero
        tone={tone}
        badge={win ? 'WON' : loss ? 'LOST' : null}
        title={win ? 'You won' : loss ? 'You lost' : 'Settled'}
        amount={<Money cents={submit.payoutCents} tone={tone} />}
        sub={<Text style={styles.sub}>Score {submit.acceptedScore}</Text>}
      />
    );
  }

  if (submit.outcome === 'streak_resolved' && submit.streakStatus === 'lost') {
    return (
      <ResultHero
        tone={colors.fail}
        badge="STREAK ENDED"
        title="Results"
        amount={<Points score={submit.acceptedScore} tone={colors.fail} />}
        sub={
          <View style={styles.ended}>
            <Glyph name="flame" size={16} color={colors.fail} />
            <Text style={styles.endedText}>Streak ended</Text>
          </View>
        }>
        <StreakLegs
          highlightFail
          failLeg={submit.currentLeg}
          targets={submit.targetScores}
        />
      </ResultHero>
    );
  }

  if (submit.outcome === 'streak_resolved') {
    return (
      <ResultHero
        tone={colors.cash}
        badge="STREAK COMPLETE"
        title="Streak complete"
        amount={<Money cents={submit.payoutCents} tone={colors.cash} />}
        sub={<Text style={styles.sub}>Score {submit.acceptedScore}</Text>}>
        {submit.targetScores ? (
          <StreakLegs targets={submit.targetScores} clearedThrough={3} />
        ) : null}
      </ResultHero>
    );
  }

  if (submit.outcome === 'streak_leg_cleared') {
    return (
      <ResultHero
        tone={colors.cash}
        badge="LEG CLEARED"
        title="Leg cleared"
        amount={<Points score={submit.acceptedScore} tone={colors.cash} />}
        sub={
          <Text style={styles.sub}>
            Next target {submit.nextTargetScore} · leg {submit.nextLeg}/
            {submit.legsTotal}
          </Text>
        }>
        <StreakLegs
          targets={submit.targetScores}
          clearedThrough={submit.legCleared}
        />
      </ResultHero>
    );
  }

  if (
    submit.outcome === 'scored_open' ||
    submit.outcome === 'scored_waiting_opponent'
  ) {
    return (
      <ResultHero
        tone={colors.streak}
        badge="WAITING"
        title="Waiting for opponent"
        amount={<Points score={submit.acceptedScore} tone={colors.streak} />}
        sub={
          <Text style={styles.sub}>
            {submit.outcome === 'scored_open'
              ? 'Refund if no one joins'
              : 'Opponent is playing'}
          </Text>
        }>
        <FaceoffAvatars
          left={{name: 'You', score: String(submit.acceptedScore)}}
          right={{name: 'Opponent', searching: true}}
        />
      </ResultHero>
    );
  }

  if (submit.outcome === 'ignored_deadline') {
    return (
      <ResultHero
        tone={colors.fail}
        badge="TOO LATE"
        title="Too late"
        amount={<Text style={styles.heroDash}>—</Text>}
        sub={
          <Text style={styles.sub}>The server clock owns this score.</Text>
        }
      />
    );
  }

  return (
    <ResultHero
      tone={colors.textPrimary}
      badge={null}
      title="Results"
      amount={<Points score={claimedScore} tone={colors.textPrimary} />}
    />
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
  // A mismatch means the server did not take the claim at face value. Tint it
  // rather than explaining it away — the accepted number is the real one.
  const adjusted = accepted != null && accepted !== claimed;

  return (
    <View style={styles.pair}>
      <View style={styles.pairCol}>
        <Text style={styles.pairLabel}>Claimed</Text>
        <Text style={styles.pairValue}>{claimed}</Text>
      </View>
      <View style={styles.pairDivider} />
      <View style={styles.pairCol}>
        <Text style={styles.pairLabel}>Accepted</Text>
        <View style={styles.pairValueRow}>
          <Text
            style={[styles.pairValue, adjusted ? styles.pairAdjusted : null]}>
            {accepted == null ? '—' : String(accepted)}
          </Text>
          {accepted != null && !adjusted ? (
            <Glyph name="check" size={13} color={colors.cash} />
          ) : null}
        </View>
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
        const score = String((targets ?? STREAK_FALLBACK_TARGETS)[n - 1]);
        return (
          <Shake key={n} trigger={failed}>
            <View
              style={[
                styles.leg,
                cleared ? styles.legCleared : null,
                failed ? styles.legFail : null,
              ]}>
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
                <FadeSlideIn
                  delay={120 * n}
                  distance={0}
                  scaleFrom={0.4}
                  duration={320}>
                  <Glyph name="check" size={18} color={colors.cash} />
                </FadeSlideIn>
              ) : (
                <Glyph name="lock" size={18} color={colors.textTertiary} />
              )}
            </View>
          </Shake>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 10,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {fontSize: 11, fontWeight: '800', letterSpacing: 1},
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroAmt: {
    fontSize: 52,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  heroDash: {
    color: colors.textTertiary,
    fontSize: 52,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroExtra: {alignSelf: 'stretch', alignItems: 'center', marginTop: 6},
  sub: {color: colors.textMuted, fontSize: 14, textAlign: 'center'},
  id: {
    color: colors.textTertiary,
    fontSize: 11,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  pairCol: {alignItems: 'center', minWidth: 80},
  pairDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  pairLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pairValueRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  pairValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pairAdjusted: {color: colors.streak},
  status: {color: colors.streak, textAlign: 'center', paddingHorizontal: 24},
  ended: {flexDirection: 'row', alignItems: 'center', gap: 6},
  endedText: {color: colors.fail, fontWeight: '700'},
  footer: {alignItems: 'center', gap: 4, marginTop: 8},
  cta: {
    backgroundColor: colors.cta,
    borderRadius: radii.pill,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  ctaLabel: {color: colors.textPrimary, fontWeight: '800', fontSize: 16},
  done: {paddingVertical: 12, paddingHorizontal: 24},
  doneLabel: {color: colors.textMuted, fontWeight: '700'},
  ladder: {alignSelf: 'stretch', paddingHorizontal: 16, gap: 10, marginTop: 8},
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
  legCleared: {borderColor: colors.cashDim},
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
