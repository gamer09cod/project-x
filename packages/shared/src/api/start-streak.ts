import type { Cents } from "../money";
import type { IsoTimestamp, Uuid } from "../ids";
import type { MatchStatus, StreakStatus } from "../domain";
import type { MutationAuth } from "./errors";

export const START_STREAK = "startStreak" as const;
export const CONTINUE_STREAK = "continueStreak" as const;
export const ABANDON_STREAK = "abandonStreak" as const;
export const GET_ACTIVE_STREAK = "getActiveStreak" as const;

export const STREAK_LEGS_TOTAL = 3 as const;

/** Display fallback when ops ladder has not been fetched yet (same as Functions). */
export const STREAK_FALLBACK_TARGETS = [12, 15, 18] as const;

export type StartStreakRequest = {
  stakeCents: Cents;
  idempotencyKey: Uuid;
};

/** Shared shape for startStreak + continueStreak leg starts. */
export type StreakRunResponse = {
  streakId: Uuid;
  pveMatchId: Uuid;
  matchPlayerId: Uuid;
  matchStatus: Extract<MatchStatus, "live">;
  streakStatus: Extract<StreakStatus, "active">;
  stakeCents: Cents;
  /** 10000 = 1.00x. Server-assigned; client must not compute payout. */
  multiplierBps: number;
  /** Target for the current leg. */
  targetScore: number;
  /** Frozen ladder at start (T1 ≤ T2 ≤ T3). */
  targetScores: [number, number, number];
  currentLeg: 1 | 2 | 3;
  legsTotal: typeof STREAK_LEGS_TOTAL;
  /** Wall-clock deadline; unfinished legs after this → forfeit, no refund. */
  expiresAt: IsoTimestamp;
  startedAt: IsoTimestamp;
  scoreDeadlineAt: IsoTimestamp;
  walletBalanceCents: Cents;
};

export type StartStreakResponse = StreakRunResponse;

export type ContinueStreakRequest = {
  streakId: Uuid;
  idempotencyKey: Uuid;
};

export type ContinueStreakResponse = StreakRunResponse;

export type AbandonStreakRequest = {
  streakId: Uuid;
  idempotencyKey: Uuid;
};

export type AbandonStreakResponse = {
  streakId: Uuid;
  streakStatus: Extract<StreakStatus, "lost"> | StreakStatus;
  failReason: string | null;
  walletBalanceCents: Cents;
};

export const startStreakAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;

export const continueStreakAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;

export const abandonStreakAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;

export type GetActiveStreakRequest = {
  /** Used only to pick an ops ladder band for previewTargets. */
  stakeCents?: Cents;
};

export type StreakSnapshot = {
  streakId: Uuid;
  streakStatus: StreakStatus;
  failReason: string | null;
  stakeCents: Cents;
  multiplierBps: number;
  targetScores: [number, number, number];
  /** Accepted scores per leg; null if that leg has not been submitted. */
  legScores: [number | null, number | null, number | null];
  currentLeg: 1 | 2 | 3;
  legsTotal: typeof STREAK_LEGS_TOTAL;
  expiresAt: IsoTimestamp;
  completedAt: IsoTimestamp | null;
  failedAt: IsoTimestamp | null;
  /** Live PvE match if a clock is ticking. */
  pveMatchId: Uuid | null;
  matchPlayerId: Uuid | null;
  startedAt: IsoTimestamp | null;
  scoreDeadlineAt: IsoTimestamp | null;
  /** Next unpaid leg is waiting for continueStreak. */
  canContinue: boolean;
  /** Remount Unity on the current live PvE match. */
  canResumeRun: boolean;
  walletBalanceCents: Cents;
};

export type GetActiveStreakResponse = {
  streak: StreakSnapshot | null;
  /** Current ops ladder for this stake band. Frozen onto the streak at start. */
  previewTargets: [number, number, number];
};

export const getActiveStreakAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;
