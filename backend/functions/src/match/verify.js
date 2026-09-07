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
const PERFECT_POINTS = 3;

/**
 * Stage 1 plausibility envelope (DECISIONS.md §1.3).
 *
 * Shadow mode by default: signals are recorded for calibration and never change
 * the accepted score. Enforcement is off until SCORE_PLAUSIBILITY_ENFORCE=1.
 *
 * These are seed thresholds derived from Swish Shot animation constants, NOT
 * from observed play. A shot cannot repeat faster than the ball recycle
 * (Ball.RECYCLE_DURATION 0.35s) plus reset (AnimationDurations.RESET_BALL 10/60s)
 * plus flight time, so 350ms is a floor no honest run can cross. Retune every
 * threshold against match_players.score_plausibility before enforcing.
 */
const MIN_SHOT_INTERVAL_MS = 350;
const PERFECT_RATIO_CEILING = 0.9;
const PERFECT_RATIO_MIN_SAMPLE = 5;
const TIMING_STDEV_FLOOR_MS = 25;
const TIMING_STDEV_MIN_SAMPLE = 5;
const BUZZER_EVIDENCE_WINDOW_MS = 8_000;

/** Availability guard, ~30x the largest physically possible run. */
const MAX_SHOT_LOG_ENTRIES = 2_000;

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
  if (p.shotLog.length > MAX_SHOT_LOG_ENTRIES) {
    fail('invalid_argument', 'shotLog too long', 'invalid-argument');
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

function median(sorted) {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(values) {
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return Math.sqrt(sq / values.length);
}

/** Keep telemetry rows small and stable to compare across runs. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Describe a run against the plausibility envelope. Pure; never throws.
 *
 * Returns metrics for calibration and any signals that tripped. A signal means
 * "this run does not look like human play", not "this run is a forgery" — the
 * caller decides whether to act on it.
 *
 * @param {ReturnType<typeof parseScorePayload>} parsed
 * @returns {{ metrics: Record<string, number | boolean | null>, signals: Array<{ code: string, value: number, threshold: number }> }}
 */
function assessPlausibility(parsed) {
  const log = parsed.shotLog;
  const gaps = [];
  let makes = 0;
  let perfect = 0;
  let lastMakeMs = -1;

  for (let i = 0; i < log.length; i++) {
    if (log[i].result === 'make') {
      makes += 1;
      lastMakeMs = log[i].tMs;
      if (log[i].pointsClaimed === PERFECT_POINTS) perfect += 1;
    }
    if (i > 0) gaps.push(log[i].tMs - log[i - 1].tMs);
  }

  let minGapMs = null;
  for (const g of gaps) {
    if (minGapMs === null || g < minGapMs) minGapMs = g;
  }
  const sortedGaps = gaps.slice().sort((a, b) => a - b);
  const perfectRatio = makes > 0 ? round2(perfect / makes) : null;
  const gapStdevMs = gaps.length > 0 ? round2(stdev(gaps)) : null;

  const metrics = {
    shots: log.length,
    makes,
    misses: log.length - makes,
    perfect,
    perfectRatio,
    minGapMs,
    medianGapMs: gaps.length > 0 ? median(sortedGaps) : null,
    gapStdevMs,
    shotsPerMinute:
      parsed.durationMs > 0
        ? round2((log.length * 60_000) / parsed.durationMs)
        : null,
    durationMs: parsed.durationMs,
    score: parsed.score,
    hasUsedBuzzerBeater: parsed.hasUsedBuzzerBeater,
  };

  const signals = [];
  const maxShots = Math.floor(parsed.durationMs / MIN_SHOT_INTERVAL_MS) + 1;

  if (minGapMs !== null && minGapMs < MIN_SHOT_INTERVAL_MS) {
    signals.push({
      code: 'shot_interval_below_floor',
      value: minGapMs,
      threshold: MIN_SHOT_INTERVAL_MS,
    });
  }
  if (log.length > maxShots) {
    signals.push({
      code: 'shot_count_above_ceiling',
      value: log.length,
      threshold: maxShots,
    });
  }
  if (makes >= PERFECT_RATIO_MIN_SAMPLE && perfectRatio > PERFECT_RATIO_CEILING) {
    signals.push({
      code: 'perfect_ratio_above_ceiling',
      value: perfectRatio,
      threshold: PERFECT_RATIO_CEILING,
    });
  }
  // Human tap timing jitters; scripted input does not.
  if (gaps.length >= TIMING_STDEV_MIN_SAMPLE && gapStdevMs < TIMING_STDEV_FLOOR_MS) {
    signals.push({
      code: 'timing_variance_below_floor',
      value: gapStdevMs,
      threshold: TIMING_STDEV_FLOOR_MS,
    });
  }
  // A run past the base clock only happens if a buzzer-beater make bought +5s,
  // so the log must show a make near the boundary rather than just a true flag.
  if (parsed.durationMs > RUN_DURATION_MS + SCORE_DURATION_SLACK_MS) {
    const evidenceFrom = RUN_DURATION_MS - BUZZER_EVIDENCE_WINDOW_MS;
    if (lastMakeMs < evidenceFrom) {
      signals.push({
        code: 'buzzer_not_evidenced',
        value: lastMakeMs,
        threshold: evidenceFrom,
      });
    }
  }

  return { metrics, signals };
}

/** Shadow by default; only an explicit opt-in lets signals zero a score. */
function plausibilityEnforced() {
  return String(process.env.SCORE_PLAUSIBILITY_ENFORCE || '').trim() === '1';
}

/**
 * Deterministic checks after a valid parse. First failure → acceptedScore 0.
 * @param {ReturnType<typeof parseScorePayload>} parsed
 * @param {{ boundClientRunId: string | null, unityBuildAllowlist: string[] | null, enforcePlausibility?: boolean }} opts
 * @returns {{ acceptedScore: number, checkFailed: boolean, failReason: string | null, plausibility: ReturnType<typeof assessPlausibility> }}
 */
function verifyScorePayload(parsed, opts) {
  const base = runDeterministicChecks(parsed, opts);
  const plausibility = assessPlausibility(parsed);

  // A deterministic failure already zeroed the score; keep its reason.
  if (base.checkFailed) {
    return { ...base, plausibility };
  }

  const enforce =
    opts.enforcePlausibility === undefined
      ? plausibilityEnforced()
      : opts.enforcePlausibility;

  if (enforce && plausibility.signals.length > 0) {
    return {
      ...zero(`implausible_${plausibility.signals[0].code}`),
      plausibility,
    };
  }

  return { ...base, plausibility };
}

function runDeterministicChecks(parsed, opts) {
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
  assessPlausibility,
  plausibilityEnforced,
  loadUnityBuildAllowlist,
  MAX_DURATION_MS,
  RUN_DURATION_MS,
  BUZZER_BEATER_BONUS_MS,
  SCORE_DURATION_SLACK_MS,
  MAKE_POINTS_ALLOWED,
  MAX_SHOT_LOG_ENTRIES,
  MIN_SHOT_INTERVAL_MS,
  PERFECT_RATIO_CEILING,
  TIMING_STDEV_FLOOR_MS,
};
