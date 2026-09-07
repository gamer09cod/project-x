/**
 * Clock bounds for a single run. Locked in Step 3 (DECISIONS.md C1).
 * durationMs on a valid payload must be <= RUN + optional buzzer-beater + slack.
 */
export const RUN_DURATION_MS = 60_000;
export const BUZZER_BEATER_BONUS_MS = 5_000;
export const SCORE_DURATION_SLACK_MS = 2_000;
export const MAX_DURATION_MS =
  RUN_DURATION_MS + BUZZER_BEATER_BONUS_MS + SCORE_DURATION_SLACK_MS;

export const SCORE_SUBMIT_WINDOW_MS = 75_000;
export const MATCHMAKING_TIMEOUT_MS = 15 * 60 * 1000;

export const SCORE_PAYLOAD_SCHEMA_VERSION = 1;

export type ShotResult = "make" | "miss";

export type ShotLogEntry = {
  /** Milliseconds from run start. Integer, >= 0, non-decreasing in the log. */
  tMs: number;
  result: ShotResult;
  /** Integer >= 0. Must match the published scoring table once gameplay locks it. */
  pointsClaimed: number;
};

/**
 * Unity → RN → submitScore. RN must not rescale or rewrite fields.
 * Schema-invalid payloads are rejected (HttpsError). Check failures after
 * a valid parse store the blob and accept score 0.
 */
export type ScorePayloadV1 = {
  schemaVersion: typeof SCORE_PAYLOAD_SCHEMA_VERSION;
  /** Claim only. Settlement uses reconstructed shotLog sum. */
  score: number;
  durationMs: number;
  clockEndedAtMs: number;
  hasUsedBuzzerBeater: boolean;
  buzzerBeaterTriggered: boolean;
  shotLog: ShotLogEntry[];
  clientRunId: string;
  unityBuildId: string;
};

export type ScorePayload = ScorePayloadV1;
