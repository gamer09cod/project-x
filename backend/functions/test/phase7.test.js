'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/https');

const {
  parseScorePayload,
  verifyScorePayload,
  MAX_DURATION_MS,
} = require('../src/match/verify');

const CLIENT_RUN = '22222222-2222-4222-8222-222222222222';

function validPayload(overrides = {}) {
  return {
    schemaVersion: 1,
    score: 5,
    durationMs: 60_000,
    clockEndedAtMs: 60_000,
    hasUsedBuzzerBeater: false,
    buzzerBeaterTriggered: false,
    shotLog: [
      { tMs: 1000, result: 'make', pointsClaimed: 3 },
      { tMs: 2000, result: 'make', pointsClaimed: 2 },
      { tMs: 3000, result: 'miss', pointsClaimed: 0 },
    ],
    clientRunId: CLIENT_RUN,
    unityBuildId: 'basketball_v1-phase6',
    ...overrides,
  };
}

describe('parseScorePayload', () => {
  it('accepts a full ScorePayloadV1', () => {
    const parsed = parseScorePayload(validPayload());
    assert.equal(parsed.score, 5);
    assert.equal(parsed.shotLog.length, 3);
  });

  it('rejects unknown schemaVersion without zeroing path', () => {
    assert.throws(
      () => parseScorePayload(validPayload({ schemaVersion: 99 })),
      (err) =>
        err instanceof HttpsError &&
        err.details &&
        err.details.code === 'unknown_schema_version',
    );
  });

  it('rejects missing shotLog', () => {
    const p = validPayload();
    delete p.shotLog;
    assert.throws(
      () => parseScorePayload(p),
      (err) =>
        err instanceof HttpsError &&
        err.details &&
        err.details.code === 'invalid_argument',
    );
  });
});

describe('verifyScorePayload', () => {
  it('accepts reconstructed score matching shotLog', () => {
    const parsed = parseScorePayload(validPayload());
    const result = verifyScorePayload(parsed, {
      boundClientRunId: null,
      unityBuildAllowlist: null,
    });
    assert.equal(result.acceptedScore, 5);
    assert.equal(result.checkFailed, false);
  });

  it('zeros when claimed score mismatches shotLog sum', () => {
    const parsed = parseScorePayload(validPayload({ score: 99 }));
    const result = verifyScorePayload(parsed, {
      boundClientRunId: null,
      unityBuildAllowlist: null,
    });
    assert.equal(result.acceptedScore, 0);
    assert.equal(result.failReason, 'score_mismatch_vs_shot_log');
  });

  it('zeros when duration exceeds MAX_DURATION_MS', () => {
    const parsed = parseScorePayload(
      validPayload({
        durationMs: MAX_DURATION_MS + 1,
        clockEndedAtMs: MAX_DURATION_MS + 1,
        score: 0,
        shotLog: [],
      }),
    );
    const result = verifyScorePayload(parsed, {
      boundClientRunId: null,
      unityBuildAllowlist: null,
    });
    assert.equal(result.acceptedScore, 0);
    assert.equal(result.failReason, 'duration_exceeds_max');
  });

  it('zeros non-monotone shotLog', () => {
    const parsed = parseScorePayload(
      validPayload({
        score: 3,
        shotLog: [
          { tMs: 2000, result: 'make', pointsClaimed: 3 },
          { tMs: 1000, result: 'miss', pointsClaimed: 0 },
        ],
      }),
    );
    const result = verifyScorePayload(parsed, {
      boundClientRunId: null,
      unityBuildAllowlist: null,
    });
    assert.equal(result.failReason, 'shot_log_not_monotone');
  });

  it('zeros clientRunId mismatch against bound seat', () => {
    const parsed = parseScorePayload(validPayload());
    const result = verifyScorePayload(parsed, {
      boundClientRunId: '11111111-1111-4111-8111-111111111111',
      unityBuildAllowlist: null,
    });
    assert.equal(result.failReason, 'client_run_id_mismatch');
  });

  it('zeros when allowlist is non-empty and build unknown', () => {
    const parsed = parseScorePayload(validPayload());
    const result = verifyScorePayload(parsed, {
      boundClientRunId: null,
      unityBuildAllowlist: ['other-build'],
    });
    assert.equal(result.failReason, 'unity_build_not_allowlisted');
  });

  it('accepts buzzer run within MAX when flags consistent', () => {
    const parsed = parseScorePayload(
      validPayload({
        durationMs: 64_000,
        clockEndedAtMs: 64_000,
        hasUsedBuzzerBeater: true,
        buzzerBeaterTriggered: true,
        score: 3,
        shotLog: [{ tMs: 60_000, result: 'make', pointsClaimed: 3 }],
      }),
    );
    const result = verifyScorePayload(parsed, {
      boundClientRunId: CLIENT_RUN,
      unityBuildAllowlist: null,
    });
    assert.equal(result.acceptedScore, 3);
    assert.equal(result.checkFailed, false);
  });
});
