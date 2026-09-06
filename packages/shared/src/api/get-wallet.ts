import type { Cents } from "../money";
import type { Uuid } from "../ids";
import type { MutationAuth } from "./errors";

export const GET_WALLET = "getWallet" as const;

export type GetWalletRequest = Record<string, never>;

export type GetWalletResponse = {
  userId: Uuid;
  balanceCents: Cents;
  rating: number;
};

export const getWalletAuth = {
  idTokenRequired: true,
  appCheckRequired: true,
} as const satisfies MutationAuth;
