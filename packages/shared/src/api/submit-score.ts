import type { Cents } from "../money";
import type { IsoTimestamp, Uuid } from "../ids";
import type { MatchStatus, StreakStatus } from "../domain";
import type { ScorePayload } from "../score-payload";
import type { MutationAuth } from "./errors";
import type { STREAK_LEGS_TOTAL } from "./start-streak";

export const SUBMIT_SCORE = "submitScore" as const;

export type SubmitScoreRequest = {
  matchId: Uuid;
  scorePayload: ScorePayload;
  idempotencyKey: Uuid;
};

export type MatchSettleResult = "win" | "loss" | "draw";

export type SubmitScoreResponse =
  | {
      outcome: "scored_open";
      matchId: Uuid;
      acceptedScore: number;
      matchStatus: Extract<MatchStatus, "open">;
      seededFromStreak: boolean;
    }
  | {
      outcome: "scored_waiting_opponent";
      matchId: Uuid;
      acceptedScore: number;
      matchStatus: Extract<MatchStatus, "paired">;
    }
  | {
      outcome: "settled";
      matchId: Uuid;
      acceptedScore: number;
      result: MatchSettleResult;
      matchStatus: Extract<MatchStatus, "settled">;
      /** Floored integer cents credited this request; 0 on loss. */
      payoutCents: Cents;
      wagerRefunded: boolean;
      boostRefunded: boolean;
      walletBalanceCents: Cents;
    }
  | {
      /** Beat current leg target; call continueStreak for the next leg (no payout yet). */
      outcome: "streak_leg_cleared";
      matchId: Uuid;
      streakId: Uuid;
      acceptedScore: number;
      streakStatus: Extract<StreakStatus, "active">;
      legCleared: 1 | 2;
      nextLeg: 2 | 3;
      nextTargetScore: number;
      targetScores: [number, number, number];
      legsTotal: typeof STREAK_LEGS_TOTAL;
      seededPvpMatchId: Uuid | null;
      expiresAt: IsoTimestamp;
      payoutCents: 0;
      walletBalanceCents: Cents;
    }
  | {
      outcome: "streak_resolved";
      matchId: Uuid;
      streakId: Uuid;
      acceptedScore: number;
      streakStatus: Extract<StreakStatus, "won" | "lost">;
      currentLeg?: 1 | 2 | 3;
      legsTotal?: typeof STREAK_LEGS_TOTAL;
      failReason?: string | null;
      seededPvpMatchId: Uuid | null;
      targetScores?: [number, number, number];
      /** Non-zero only on full 3-leg clear. */
      payoutCents: Cents;
      walletBalanceCents: Cents;
    }
  | {
      /** Valid payload arrived after score_deadline_at. Cron owns score 0. */
      outcome: "ignored_deadline";
      matchId: Uuid;
    };

export const submitScoreAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;
