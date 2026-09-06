'use strict';

/**
 * Phase 7 scorePayload defence (DECISIONS.md §3.3).
 * Schema failures throw HttpsError (do not zero).
 * Check failures → acceptedScore 0; caller still persists the blob.
 */

const { fail, isUuid } = require('../auth');

const RUN_DURATION_MS = 60_000;
const BUZZER_BEATER_BONUS_MS = 5_000;
const SCORE_DURATION_SLACK_MS = 2_000;
const MAX_DURATION_MS =
  RUN_DURATION_MS + BUZZER_BEATER_BONUS_MS + SCORE_DURATION_SLACK_MS;

/** Locked to Swish Shot game_config: Perfect 3 / Hoop 2 / Backboard 1 / miss 0. */
const MAKE_POINTS_ALLOWED = new Set([1, 2, 3]);

/**
 * Strict schema parse. Invalid → HttpsError (reject callable, do not zero).
 * @param {unknown} payload
 */
function parseScorePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('invalid_argument', 'scorePayload required', 'invalid-argument');
  }
  const p = /** @type {Record<string, unknown>} */ (payload);

  if (p.schemaVersion !== 1) {
    fail('unknown_schema_version', 'Unsupported schemaVersion', 'invalid-argument');
  }
  if (!Number.isInteger(p.score) || /** @type {number} */ (p.score) < 0) {
    fail('invalid_argument', 'score must be a non-negative integer', 'invalid-argument');
  }
  if (!Number.isInteger(p.durationMs) || /** @type {number} */ (p.durationMs) < 0) {
    fail('invalid_argument', 'durationMs must be a non-negative integer', 'invalid-argument');
  }
  if (
    !Number.isInteger(p.clockEndedAtMs) ||
    /** @type {number} */ (p.clockEndedAtMs) < 0
  ) {
    fail(
      'invalid_argument',
      'clockEndedAtMs must be a non-negative integer',
      'invalid-argument',
    );
  }
  if (typeof p.hasUsedBuzzerBeater !== 'boolean') {
    fail('invalid_argument', 'hasUsedBuzzerBeater must be boolean', 'invalid-argument');
  }
  if (typeof p.buzzerBeaterTriggered !== 'boolean') {
    fail(
      'invalid_argument',
      'buzzerBeaterTriggered must be boolean',
      'invalid-argument',
    );
  }
  if (typeof p.clientRunId !== 'string' || !isUuid(p.clientRunId)) {
    fail('invalid_argument', 'clientRunId must be a UUID', 'invalid-argument');
  }
  if (typeof p.unityBuildId !== 'string' || p.unityBuildId.length === 0) {
    fail('invalid_argument', 'unityBuildId required', 'invalid-argument');
  }
  if (!Array.isArray(p.shotLog)) {
    fail('invalid_argument', 'shotLog must be an array', 'invalid-argument');
  }

  /** @type {Array<{ tMs: number, result: string, pointsClaimed: number }>} */
  const shotLog = [];
  for (let i = 0; i < p.shotLog.length; i++) {
    const entry = p.shotLog[i];
    if (!entry || typeof entry !== 'object') {
      fail('invalid_argument', `shotLog[${i}] invalid`, 'invalid-argument');
    }
    const e = /** @type {Record<string, unknown>} */ (entry);
    if (!Number.isInteger(e.tMs) || /** @type {number} */ (e.tMs) < 0) {
      fail('invalid_argument', `shotLog[${i}].tMs invalid`, 'invalid-argument');
    }
    if (e.result !== 'make' && e.result !== 'miss') {
      fail('invalid_argument', `shotLog[${i}].result invalid`, 'invalid-argument');
    }
    if (!Number.isInteger(e.pointsClaimed) || /** @type {number} */ (e.pointsClaimed) < 0) {
      fail(
        'invalid_argument',
        `shotLog[${i}].pointsClaimed invalid`,
        'invalid-argument',
      );
    }
    shotLog.push({
      tMs: /** @type {number} */ (e.tMs),
      result: /** @type {string} */ (e.result),
      pointsClaimed: /** @type {number} */ (e.pointsClaimed),
    });
  }

  return {
    schemaVersion: 1,
    score: /** @type {number} */ (p.score),
    durationMs: /** @type {number} */ (p.durationMs),
    clockEndedAtMs: /** @type {number} */ (p.clockEndedAtMs),
    hasUsedBuzzerBeater: /** @type {boolean} */ (p.hasUsedBuzzerBeater),
    buzzerBeaterTriggered: /** @type {boolean} */ (p.buzzerBeaterTriggered),
    shotLog,
    clientRunId: /** @type {string} */ (p.clientRunId),
    unityBuildId: /** @type {string} */ (p.unityBuildId),
    raw: p,
  };
}

/**
 * Deterministic checks after a valid parse. First failure → acceptedScore 0.
 * @param {ReturnType<typeof parseScorePayload>} parsed
 * @param {{ boundClientRunId: string | null, unityBuildAllowlist: string[] | null }} opts
 * @returns {{ acceptedScore: number, checkFailed: boolean, failReason: string | null }}
 */
function verifyScorePayload(parsed, opts) {
  const bound = opts.boundClientRunId;
  if (bound != null && bound !== parsed.clientRunId) {
    return zero('client_run_id_mismatch');
  }

  if (parsed.buzzerBeaterTriggered && !parsed.hasUsedBuzzerBeater) {
    return zero('buzzer_flag_inconsistent');
  }

  if (parsed.durationMs > MAX_DURATION_MS) {
    return zero('duration_exceeds_max');
  }

  if (!parsed.hasUsedBuzzerBeater && parsed.durationMs > RUN_DURATION_MS + SCORE_DURATION_SLACK_MS) {
    return zero('duration_exceeds_run_without_buzzer');
  }

  let prevT = -1;
  let reconstructed = 0;
  for (let i = 0; i < parsed.shotLog.length; i++) {
    const shot = parsed.shotLog[i];
    if (shot.tMs < prevT) {
      return zero('shot_log_not_monotone');
    }
    if (shot.tMs > parsed.durationMs) {
      return zero('shot_time_past_duration');
    }
    prevT = shot.tMs;

    if (shot.result === 'miss') {
      if (shot.pointsClaimed !== 0) {
        return zero('miss_points_nonzero');
      }
    } else if (!MAKE_POINTS_ALLOWED.has(shot.pointsClaimed)) {
      return zero('make_points_not_in_table');
    }
    reconstructed += shot.pointsClaimed;
  }

  if (parsed.score !== reconstructed) {
    return zero('score_mismatch_vs_shot_log');
  }

  const allowlist = opts.unityBuildAllowlist;
  if (Array.isArray(allowlist) && allowlist.length > 0) {
    if (!allowlist.includes(parsed.unityBuildId)) {
      return zero('unity_build_not_allowlisted');
    }
  }

  return {
    acceptedScore: reconstructed,
    checkFailed: false,
    failReason: null,
  };
}

function zero(reason) {
  return { acceptedScore: 0, checkFailed: true, failReason: reason };
}

/**
 * Comma-separated UNITY_BUILD_ALLOWLIST env, or null = accept all (Phase 9 fail-closed).
 * @returns {string[] | null}
 */
function loadUnityBuildAllowlist() {
  const raw = process.env.UNITY_BUILD_ALLOWLIST;
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  parseScorePayload,
  verifyScorePayload,
  loadUnityBuildAllowlist,
  MAX_DURATION_MS,
  RUN_DURATION_MS,
  BUZZER_BEATER_BONUS_MS,
  SCORE_DURATION_SLACK_MS,
  MAKE_POINTS_ALLOWED,
};
