'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/https');

const {
  parseScorePayload,
  verifyScorePayload,
  assessPlausibility,
  MAX_SHOT_LOG_ENTRIES,
  MIN_SHOT_INTERVAL_MS,
} = require('../src/match/verify');

const CLIENT_RUN = '22222222-2222-4222-8222-222222222222';

function payload(overrides = {}) {
  return {
    schemaVersion: 1,
    score: 0,
    durationMs: 60_000,
    clockEndedAtMs: 60_000,
    hasUsedBuzzerBeater: false,
    buzzerBeaterTriggered: false,
    shotLog: [],
    clientRunId: CLIENT_RUN,
    unityBuildId: 'basketball_v1-phase6',
    ...overrides,
  };
}

/** A run that looks like a human played it: jittered cadence, mixed outcomes. */
function honestRun() {
  const points = [2, 0, 3, 1, 2, 2, 0, 3, 2, 1, 0, 2, 3, 1, 2];
  const jitter = [0, 310, -180, 240, -90, 420, -260, 130, 350, -200, 60, 280, -140, 190, -70];
  const shotLog = [];
  let t = 1_200;
  let score = 0;
  for (let i = 0; i < points.length; i++) {
    t += 2_000 + jitter[i];
    shotLog.push({
      tMs: t,
      result: points[i] === 0 ? 'miss' : 'make',
      pointsClaimed: points[i],
    });
    score += points[i];
  }
  return payload({ score, shotLog });
}

/** The cheapest forgery: rapid-fire perfect threes with machine timing. */
function forgedRun(shots = 200, gapMs = 300) {
  const shotLog = [];
  for (let i = 0; i < shots; i++) {
    shotLog.push({ tMs: i * gapMs, result: 'make', pointsClaimed: 3 });
  }
  return payload({ score: shots * 3, shotLog });
}

const VERIFY_OPTS = { boundClientRunId: null, unityBuildAllowlist: null };

function codes(result) {
  return result.plausibility.signals.map((s) => s.code);
}

describe('assessPlausibility metrics', () => {
  it('computes gap, make and perfect statistics', () => {
    const parsed = parseScorePayload(
      payload({
        score: 6,
        shotLog: [
          { tMs: 1_000, result: 'make', pointsClaimed: 3 },
          { tMs: 3_000, result: 'miss', pointsClaimed: 0 },
          { tMs: 6_000, result: 'make', pointsClaimed: 3 },
        ],
      }),
    );
    const { metrics } = assessPlausibility(parsed);
    assert.equal(metrics.shots, 3);
    assert.equal(metrics.makes, 2);
    assert.equal(metrics.misses, 1);
    assert.equal(metrics.perfect, 2);
    assert.equal(metrics.perfectRatio, 1);
    assert.equal(metrics.minGapMs, 2_000);
    assert.equal(metrics.medianGapMs, 2_500);
    assert.equal(metrics.score, 6);
  });

  it('reports null gap statistics when there is nothing to compare', () => {
    const parsed = parseScorePayload(payload());
    const { metrics, signals } = assessPlausibility(parsed);
    assert.equal(metrics.shots, 0);
    assert.equal(metrics.minGapMs, null);
    assert.equal(metrics.gapStdevMs, null);
    assert.equal(metrics.perfectRatio, null);
    assert.deepEqual(signals, []);
  });
});

describe('plausibility signals', () => {
  it('stays silent on a human-looking run', () => {
    const parsed = parseScorePayload(honestRun());
    assert.deepEqual(assessPlausibility(parsed).signals, []);
  });

  it('flags a rapid-fire all-perfect forgery on every axis', () => {
    const parsed = parseScorePayload(forgedRun());
    const found = assessPlausibility(parsed).signals.map((s) => s.code);
    assert.deepEqual(found, [
      'shot_interval_below_floor',
      'shot_count_above_ceiling',
      'perfect_ratio_above_ceiling',
      'timing_variance_below_floor',
    ]);
  });

  it('flags shots closer together than the ball can physically recycle', () => {
    const parsed = parseScorePayload(
      payload({
        score: 4,
        shotLog: [
          { tMs: 1_000, result: 'make', pointsClaimed: 2 },
          { tMs: 1_000 + MIN_SHOT_INTERVAL_MS - 1, result: 'make', pointsClaimed: 2 },
        ],
      }),
    );
    assert.ok(
      assessPlausibility(parsed).signals.some(
        (s) => s.code === 'shot_interval_below_floor',
      ),
    );
  });

  it('ignores a high perfect ratio below the sample floor', () => {
    const parsed = parseScorePayload(
      payload({
        score: 6,
        shotLog: [
          { tMs: 1_000, result: 'make', pointsClaimed: 3 },
          { tMs: 4_000, result: 'make', pointsClaimed: 3 },
        ],
      }),
    );
    assert.deepEqual(assessPlausibility(parsed).signals, []);
  });

  it('flags an over-long run with no buzzer-beater make near the boundary', () => {
    const parsed = parseScorePayload(
      payload({
        durationMs: 65_000,
        clockEndedAtMs: 65_000,
        hasUsedBuzzerBeater: true,
        buzzerBeaterTriggered: true,
        score: 3,
        shotLog: [{ tMs: 4_000, result: 'make', pointsClaimed: 3 }],
      }),
    );
    assert.ok(
      assessPlausibility(parsed).signals.some((s) => s.code === 'buzzer_not_evidenced'),
    );
  });

  it('accepts an over-long run when the log shows the buzzer make', () => {
    const parsed = parseScorePayload(
      payload({
        durationMs: 65_000,
        clockEndedAtMs: 65_000,
        hasUsedBuzzerBeater: true,
        buzzerBeaterTriggered: true,
        score: 3,
        shotLog: [{ tMs: 59_800, result: 'make', pointsClaimed: 3 }],
      }),
    );
    assert.deepEqual(assessPlausibility(parsed).signals, []);
  });
});

describe('shadow mode vs enforcement', () => {
  it('records signals without changing the accepted score', () => {
    const parsed = parseScorePayload(forgedRun());
    const result = verifyScorePayload(parsed, {
      ...VERIFY_OPTS,
      enforcePlausibility: false,
    });
    assert.equal(result.acceptedScore, 600);
    assert.equal(result.checkFailed, false);
    assert.equal(result.failReason, null);
    assert.ok(codes(result).length > 0);
  });

  it('zeros the score once enforcement is on', () => {
    const parsed = parseScorePayload(forgedRun());
    const result = verifyScorePayload(parsed, {
      ...VERIFY_OPTS,
      enforcePlausibility: true,
    });
    assert.equal(result.acceptedScore, 0);
    assert.equal(result.checkFailed, true);
    assert.equal(result.failReason, 'implausible_shot_interval_below_floor');
  });

  it('leaves an honest run untouched under enforcement', () => {
    const parsed = parseScorePayload(honestRun());
    const result = verifyScorePayload(parsed, {
      ...VERIFY_OPTS,
      enforcePlausibility: true,
    });
    assert.equal(result.checkFailed, false);
    assert.equal(result.acceptedScore, parsed.score);
  });

  it('keeps the deterministic failure reason rather than a plausibility one', () => {
    const forged = forgedRun();
    forged.score = 99_999;
    const parsed = parseScorePayload(forged);
    const result = verifyScorePayload(parsed, {
      ...VERIFY_OPTS,
      enforcePlausibility: true,
    });
    assert.equal(result.failReason, 'score_mismatch_vs_shot_log');
    assert.ok(codes(result).length > 0, 'signals still recorded for calibration');
  });

  it('attaches plausibility to every result for persistence', () => {
    const parsed = parseScorePayload(honestRun());
    const result = verifyScorePayload(parsed, VERIFY_OPTS);
    assert.ok(result.plausibility.metrics);
    assert.ok(Array.isArray(result.plausibility.signals));
  });
});

describe('shotLog size guard', () => {
  it('rejects a shotLog past the availability cap', () => {
    const shotLog = new Array(MAX_SHOT_LOG_ENTRIES + 1)
      .fill(null)
      .map((_, i) => ({ tMs: i, result: 'miss', pointsClaimed: 0 }));
    assert.throws(
      () => parseScorePayload(payload({ shotLog })),
      (err) =>
        err instanceof HttpsError &&
        err.details &&
        err.details.code === 'invalid_argument',
    );
  });
});
