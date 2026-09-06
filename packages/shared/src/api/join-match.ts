import type { Cents } from "../money";
import type { GameId, IsoTimestamp, Uuid } from "../ids";
import type { MatchMode, MatchPlayerSeat, MatchStatus } from "../domain";
import type { MutationAuth } from "./errors";

export const JOIN_MATCH = "joinMatch" as const;

export type JoinMatchRequest = {
  gameId: GameId;
  stakeCents: Cents;
  /** Prize boost instance to consume. Omit or null for no boost. */
  boostId: Uuid | null;
  idempotencyKey: Uuid;
};

export type JoinMatchResponse = {
  matchId: Uuid;
  matchPlayerId: Uuid;
  seat: MatchPlayerSeat;
  mode: Extract<MatchMode, "pvp_1v1">;
  matchStatus: Extract<MatchStatus, "live" | "paired">;
  stakeCents: Cents;
  startedAt: IsoTimestamp;
  scoreDeadlineAt: IsoTimestamp;
  boostId: Uuid | null;
  /** Server snapshot of the boost applied at entry. Null when no boost. */
  boost: {
    id: Uuid;
    percentageBps: number;
    maxWagerCents: Cents;
  } | null;
  /**
   * Present when this call paired into an existing open score.
   * The joiner still must play; this is the posted opponent claim/accepted score.
   */
  opponentPostedScore: number | null;
  walletBalanceCents: Cents;
};

export const joinMatchAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;
