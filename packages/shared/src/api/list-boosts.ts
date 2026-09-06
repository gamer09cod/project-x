import type { Cents } from "../money";
import type { GameId, IsoTimestamp, Uuid } from "../ids";
import type { MatchMode } from "../domain";
import type { MutationAuth } from "./errors";

export const LIST_BOOSTS = "listBoosts" as const;

export type PlayerBoost = {
  id: Uuid;
  name: string;
  percentageBps: number;
  gameId: GameId;
  gameName: string;
  gameMode: MatchMode;
  maxWagerCents: Cents | null;
  expiresAt: IsoTimestamp;
  status: "available";
};

export type ListBoostsRequest = Record<string, never>;

export type ListBoostsResponse = {
  boosts: PlayerBoost[];
};

export const listBoostsAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;
