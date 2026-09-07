import type {
  IsoTimestamp,
  StreakRunResponse,
  StreakSnapshot,
  SubmitScoreResponse,
} from '@project-x/shared';
import {STREAK_FALLBACK_TARGETS} from '@project-x/shared';

function coerceTargets(
  scores: [number, number, number] | undefined,
  fallback?: [number, number, number] | null,
): [number, number, number] {
  if (scores && scores.length === 3 && scores.every(n => Number.isFinite(n))) {
    return scores;
  }
  if (fallback && fallback.length === 3) {
    return fallback;
  }
  return [
    STREAK_FALLBACK_TARGETS[0],
    STREAK_FALLBACK_TARGETS[1],
    STREAK_FALLBACK_TARGETS[2],
  ];
}

function emptyScores(): [number | null, number | null, number | null] {
  return [null, null, null];
}

export function snapshotFromStreakRun(
  run: StreakRunResponse,
  prior: StreakSnapshot | null = null,
): StreakSnapshot {
  return {
    streakId: run.streakId,
    streakStatus: run.streakStatus,
    failReason: null,
    stakeCents: run.stakeCents,
    multiplierBps: run.multiplierBps,
    targetScores: coerceTargets(run.targetScores, prior?.targetScores),
    legScores: prior?.streakId === run.streakId ? prior.legScores : emptyScores(),
    currentLeg: run.currentLeg,
    legsTotal: run.legsTotal,
    expiresAt: run.expiresAt,
    completedAt: null,
    failedAt: null,
    pveMatchId: run.pveMatchId,
    matchPlayerId: run.matchPlayerId,
    startedAt: run.startedAt,
    scoreDeadlineAt: run.scoreDeadlineAt,
    serverNowEpochMs: run.serverNowEpochMs,
    gameStartEpochMs: run.gameStartEpochMs,
    gameEndEpochMs: run.gameEndEpochMs,
    canContinue: false,
    canResumeRun: true,
    walletBalanceCents: run.walletBalanceCents,
  };
}

export function snapshotFromSubmit(
  submit: SubmitScoreResponse,
  prior: StreakSnapshot | null,
): StreakSnapshot | null {
  if (
    submit.outcome !== 'streak_leg_cleared' &&
    submit.outcome !== 'streak_resolved'
  ) {
    return prior;
  }
  const targets = coerceTargets(submit.targetScores, prior?.targetScores);
  const scores: [number | null, number | null, number | null] = [
    prior?.legScores[0] ?? null,
    prior?.legScores[1] ?? null,
    prior?.legScores[2] ?? null,
  ];
  if (submit.outcome === 'streak_leg_cleared') {
    scores[submit.legCleared - 1] = submit.acceptedScore;
    return {
      streakId: submit.streakId,
      streakStatus: 'active',
      failReason: null,
      stakeCents: prior?.stakeCents ?? (0 as StreakSnapshot['stakeCents']),
      multiplierBps: prior?.multiplierBps ?? 25000,
      targetScores: targets,
      legScores: scores,
      currentLeg: submit.nextLeg,
      legsTotal: submit.legsTotal,
      expiresAt: submit.expiresAt,
      completedAt: null,
      failedAt: null,
      pveMatchId: null,
      matchPlayerId: null,
      startedAt: null,
      scoreDeadlineAt: null,
      serverNowEpochMs: null,
      gameStartEpochMs: null,
      gameEndEpochMs: null,
      canContinue: true,
      canResumeRun: false,
      walletBalanceCents: submit.walletBalanceCents,
    };
  }
  const leg = submit.currentLeg ?? prior?.currentLeg ?? 1;
  scores[leg - 1] = submit.acceptedScore;
  return {
    streakId: submit.streakId,
    streakStatus: submit.streakStatus,
    failReason: submit.failReason ?? null,
    stakeCents: prior?.stakeCents ?? (0 as StreakSnapshot['stakeCents']),
    multiplierBps: prior?.multiplierBps ?? 25000,
    targetScores: targets,
    legScores: scores,
    currentLeg: leg,
    legsTotal: submit.legsTotal ?? 3,
    expiresAt:
      prior?.expiresAt ?? (new Date().toISOString() as IsoTimestamp),
    completedAt:
      submit.streakStatus === 'won'
        ? (new Date().toISOString() as IsoTimestamp)
        : null,
    failedAt:
      submit.streakStatus === 'lost'
        ? (new Date().toISOString() as IsoTimestamp)
        : null,
    pveMatchId: null,
    matchPlayerId: null,
    startedAt: null,
    scoreDeadlineAt: null,
    serverNowEpochMs: null,
    gameStartEpochMs: null,
    gameEndEpochMs: null,
    canContinue: false,
    canResumeRun: false,
    walletBalanceCents: submit.walletBalanceCents,
  };
}
