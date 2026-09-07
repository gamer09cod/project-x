import {snapshotFromStreakRun} from '../src/features/play/streakSnapshot';
import {formatCentsDisplay} from '../src/lib/formatMoney';
import {mapCallableError} from '../src/lib/callableErrors';
import {
  acceptedScoreOf,
  isPendingResult,
  prependResult,
  resultTitle,
  type ResultEntry,
} from '../src/features/results/resultHistory';
import type {Cents, ScorePayload, SubmitScoreResponse, Uuid} from '@project-x/shared';

test('snapshotFromStreakRun keeps server targets', () => {
  const snap = snapshotFromStreakRun({
    streakId: MATCH,
    pveMatchId: MATCH,
    matchPlayerId: MATCH,
    matchStatus: 'live',
    streakStatus: 'active',
    stakeCents: cents(10000),
    multiplierBps: 25000,
    targetScore: 12,
    targetScores: [12, 15, 18],
    currentLeg: 1,
    legsTotal: 3,
    expiresAt: '2026-09-07T00:00:00.000Z' as never,
    startedAt: '2026-09-06T00:00:00.000Z' as never,
    scoreDeadlineAt: '2026-09-06T00:01:15.000Z' as never,
    serverNowEpochMs: 1_000_000,
    gameStartEpochMs: 1_000_000,
    gameEndEpochMs: 1_060_000,
    walletBalanceCents: cents(500),
  });
  expect(snap.targetScores).toEqual([12, 15, 18]);
  expect(snap.canResumeRun).toBe(true);
  expect(snap.currentLeg).toBe(1);
  expect(snap.gameEndEpochMs).toBe(1_060_000);
});

test('formatCentsDisplay pads cents', () => {
  expect(formatCentsDisplay(0)).toBe('$0.00');
  expect(formatCentsDisplay(620)).toBe('$6.20');
  expect(formatCentsDisplay(100)).toBe('$1.00');
  expect(formatCentsDisplay(-50)).toBe('-$0.50');
});

test('formatCentsDisplay rejects non-integers', () => {
  expect(() => formatCentsDisplay(1.5)).toThrow(/integer/);
});

test('mapCallableError maps streak expired forfeit copy', () => {
  const mapped = mapCallableError({
    code: 'functions/failed-precondition',
    message: 'raw',
    details: {code: 'streak_expired'},
  });
  expect(mapped.code).toBe('streak_expired');
  expect(mapped.message).toMatch(/not refunded/i);
});

test('mapCallableError reads details.code', () => {
  const mapped = mapCallableError({
    code: 'functions/failed-precondition',
    message: 'raw',
    details: {code: 'insufficient_funds'},
  });
  expect(mapped.code).toBe('insufficient_funds');
  expect(mapped.message).toBe('Not enough balance for this entry.');
});

test('mapCallableError maps boost wager limit', () => {
  const mapped = mapCallableError({
    code: 'functions/failed-precondition',
    message: 'raw',
    details: {code: 'boost_wager_limit'},
  });
  expect(mapped.code).toBe('boost_wager_limit');
  expect(mapped.message).toBe('This stake is above the boost maximum.');
});

test('mapCallableError falls back to message', () => {
  const mapped = mapCallableError({
    code: 'functions/not-found',
    message: 'NOT FOUND',
  });
  expect(mapped.message).toBe('NOT FOUND');
});

const payload: ScorePayload = {
  schemaVersion: 1,
  score: 12,
  durationMs: 15000,
  clockEndedAtMs: 15000,
  hasUsedBuzzerBeater: false,
  buzzerBeaterTriggered: false,
  shotLog: [],
  clientRunId: 'run-1',
  unityBuildId: 'build-1',
};

function entry(submit: SubmitScoreResponse, recordedAtMs = 1): ResultEntry {
  return {submit, payload, recordedAtMs};
}

const MATCH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid;
const cents = (n: number) => n as Cents;

test('isPendingResult covers open and streak-leg outcomes', () => {
  expect(
    isPendingResult({
      outcome: 'scored_open',
      matchId: MATCH,
      acceptedScore: 12,
      matchStatus: 'open',
      seededFromStreak: false,
    }),
  ).toBe(true);
  expect(
    isPendingResult({
      outcome: 'settled',
      matchId: MATCH,
      acceptedScore: 12,
      result: 'win',
      matchStatus: 'settled',
      payoutCents: cents(180),
      wagerRefunded: false,
      boostRefunded: false,
      walletBalanceCents: cents(800),
    }),
  ).toBe(false);
});

test('acceptedScoreOf is null on ignored deadline', () => {
  expect(
    acceptedScoreOf({
      outcome: 'ignored_deadline',
      matchId: MATCH,
    }),
  ).toBeNull();
  expect(
    acceptedScoreOf({
      outcome: 'scored_waiting_opponent',
      matchId: MATCH,
      acceptedScore: 9,
      matchStatus: 'paired',
    }),
  ).toBe(9);
});

test('resultTitle maps server outcomes', () => {
  expect(
    resultTitle({
      outcome: 'scored_open',
      matchId: MATCH,
      acceptedScore: 1,
      matchStatus: 'open',
      seededFromStreak: false,
    }),
  ).toBe('Waiting for opponent');
  expect(
    resultTitle({
      outcome: 'settled',
      matchId: MATCH,
      acceptedScore: 1,
      result: 'loss',
      matchStatus: 'settled',
      payoutCents: cents(0),
      wagerRefunded: false,
      boostRefunded: false,
      walletBalanceCents: cents(0),
    }),
  ).toBe('Loss');
});

test('prependResult replaces the same match and caps length', () => {
  const first = entry({
    outcome: 'scored_open',
    matchId: MATCH,
    acceptedScore: 4,
    matchStatus: 'open',
    seededFromStreak: false,
  });
  const updated = entry({
    outcome: 'settled',
    matchId: MATCH,
    acceptedScore: 4,
    result: 'win',
    matchStatus: 'settled',
    payoutCents: cents(180),
    wagerRefunded: false,
    boostRefunded: false,
    walletBalanceCents: cents(500),
  });
  const next = prependResult([first], updated);
  expect(next).toHaveLength(1);
  expect(next[0].submit.outcome).toBe('settled');

  const many: ResultEntry[] = [];
  for (let i = 0; i < 40; i += 1) {
    many.push(
      entry({
        outcome: 'scored_open',
        matchId: `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb${String(i).padStart(2, '0')}` as Uuid,
        acceptedScore: i,
        matchStatus: 'open',
        seededFromStreak: false,
      }),
    );
  }
  const overflow = prependResult(many, first);
  expect(overflow).toHaveLength(40);
  expect(overflow[0].submit.matchId).toBe(first.submit.matchId);
});
